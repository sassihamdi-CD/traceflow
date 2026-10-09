-- 009: workspace invite codes (redeemable for membership).
-- Idempotent: safe to re-run (IF NOT EXISTS / IF EXISTS / ON CONFLICT guards).

CREATE TABLE IF NOT EXISTS invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'reviewer' CHECK (role IN ('admin','reviewer','supplier','auditor')),
  expires_at TIMESTAMPTZ,
  used_count INT NOT NULL DEFAULT 0,
  max_uses INT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invites_workspace ON invites(workspace_id);

GRANT SELECT, INSERT, UPDATE ON client_requests TO CURRENT_USER;

-- Key hygiene (per-company DB decision, 2026-10-07):
-- The pilot code TF-133C98 was committed to git and is COMPROMISED.
-- Do NOT seed a live invite here. Per-company invites are created at
-- provisioning time (see docs/COMPANY_PROVISIONING.md):
--   INSERT INTO invites (workspace_id, code_hash, role, max_uses, expires_at)
--   VALUES ('<WORKSPACE_ID>', sha256('<fresh-random-code>'), 'reviewer', 5,
--           now() + interval '7 days');
-- Every invite MUST set max_uses AND expires_at (unlimited/never-expire
-- invites are rejected in review). Migration 014 deletes the compromised
-- TF-133C98 row on existing DBs.
