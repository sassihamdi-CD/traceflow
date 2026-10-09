-- 008: DB-backed extraction job queue.
-- Idempotent: safe to re-run (IF NOT EXISTS guards).

CREATE TABLE IF NOT EXISTS extraction_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed')),
  attempts INT NOT NULL DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON extraction_jobs(status, created_at);

GRANT SELECT, INSERT, UPDATE ON client_requests TO CURRENT_USER;
