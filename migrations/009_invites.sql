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

GRANT SELECT, INSERT, UPDATE, DELETE ON invites TO traceflow_app;

-- Seed: pilot invite code TF-133C98 (sha256 hex of the code).
INSERT INTO invites (workspace_id, code_hash, role, max_uses)
VALUES ('4db22bd4-77a6-4013-91c7-7e8936680909', '457a99ba6245c9b730dfb536201ca55756537811285a3159f675157d3fd90538', 'reviewer', NULL)
ON CONFLICT DO NOTHING;
