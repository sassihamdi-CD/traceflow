import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function POST(req: NextRequest) {
  const { code } = await req.json();
  const client = await pool.connect();
  
  try {
    const codeHash = crypto.createHash("sha256").update(code).digest("hex");
    
    // Use the redeem_invite function if it exists, otherwise manual update
    try {
      const result = await client.query("SELECT redeem_invite($1) as success", [codeHash]);
      if (result.rows[0]?.success) {
        return NextResponse.json({ success: true });
      }
    } catch {
      // Function doesn't exist, do manual update
    }
    
    const result = await client.query(
      `UPDATE invites 
       SET used_count = used_count + 1 
       WHERE code_hash = $1 
       AND used_count < max_uses 
       AND expires_at > NOW()
       RETURNING id`,
      [codeHash]
    );
    
    if (result.rows.length === 0) {
      return NextResponse.json({ message: "Invalid or expired invite code" }, { status: 400 });
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Invite redeem error:", error);
    return NextResponse.json({ message: "Failed to redeem invite" }, { status: 500 });
  } finally {
    client.release();
  }
}
