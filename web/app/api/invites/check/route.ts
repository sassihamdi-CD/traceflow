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
    const result = await client.query(
      `SELECT id, code_hash, max_uses, used_count, expires_at, company_name 
       FROM invites WHERE code_hash = $1`,
      [codeHash]
    );
    
    if (result.rows.length === 0) {
      return NextResponse.json({ message: "Invalid invite code" }, { status: 400 });
    }
    
    const data = result.rows[0];
    if (data.used_count >= data.max_uses) {
      return NextResponse.json({ message: "Invite code has been used up" }, { status: 400 });
    }
    if (new Date(data.expires_at) < new Date()) {
      return NextResponse.json({ message: "Invite code has expired" }, { status: 400 });
    }
    
    return NextResponse.json({ valid: true, company: data.company_name });
  } catch (error) {
    console.error("Invite check error:", error);
    return NextResponse.json({ message: "Failed to check invite" }, { status: 500 });
  } finally {
    client.release();
  }
}
