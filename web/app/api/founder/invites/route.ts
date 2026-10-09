import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { Pool } from "pg";

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "TF-";
  for (let i = 0; i < 6; i++) {
    code += chars[crypto.randomInt(0, chars.length)];
  }
  return code;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function POST(req: NextRequest) {
  const { company_name, contact_name, contact_email, role, max_uses, expires_in_days } = await req.json();
  const client = await pool.connect();
  
  try {
    // Get the first workspace (pilot)
    const wsResult = await client.query("SELECT id FROM workspaces LIMIT 1");
    if (wsResult.rows.length === 0) {
      return NextResponse.json({ message: "No workspace available" }, { status: 500 });
    }
    const workspace_id = wsResult.rows[0].id;

    // Generate unique code
    let code = generateCode();
    let codeHash = crypto.createHash("sha256").update(code).digest("hex");

    // Check if code already exists (very unlikely but safe)
    const existing = await client.query("SELECT id FROM invites WHERE code_hash = $1", [codeHash]);
    if (existing.rows.length > 0) {
      code = generateCode();
      codeHash = crypto.createHash("sha256").update(code).digest("hex");
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (expires_in_days || 30));

    await client.query(
      `INSERT INTO invites (workspace_id, code_hash, role, max_uses, expires_at, company_name, contact_name, contact_email)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [workspace_id, codeHash, role || "reviewer", max_uses || 5, expiresAt.toISOString(), company_name || "", contact_name || "", contact_email || ""]
    );

    return NextResponse.json({ code });
  } catch (error) {
    console.error("Invite creation error:", error);
    return NextResponse.json({ message: error instanceof Error ? error.message : "Failed to create invite" }, { status: 400 });
  } finally {
    client.release();
  }
}
