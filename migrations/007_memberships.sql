-- 007: workspace memberships (multi-tenant access control).
-- Idempotent: safe to re-run (IF NOT EXISTS / IF EXISTS / ON CONFLICT guards).

CREATE TABLE IF NOT EXISTS memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin','reviewer','supplier','auditor')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_workspace ON memberships(workspace_id);

-- App role manages invites: full row access on memberships.
-- audit_log stays SELECT + INSERT only (untouched here).
GRANT SELECT, INSERT, UPDATE, DELETE ON memberships TO traceflow_app;

-- Seed: pilot admin membership (real user_id linked later via backfill).
INSERT INTO memberships (workspace_id, user_id, role)
VALUES ('4db22bd4-77a6-4013-91c7-7e8936680909', 'pilot-admin', 'admin')
ON CONFLICT (user_id, workspace_id) DO NOTHING;
