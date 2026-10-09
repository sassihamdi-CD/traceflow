-- 011: full per-document transcription store.
-- Every uploaded document gets ALL its labeled values transcribed
-- (e.g. every chemical substance + limit + unit + location), kept
-- separate from the 7-field passport mapping in field_values.
-- Idempotent: safe to re-run (IF NOT EXISTS guards).

CREATE TABLE IF NOT EXISTS document_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  value TEXT NOT NULL,
  unit TEXT,
  location TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_items_doc ON document_items(document_id);

GRANT SELECT, INSERT, UPDATE ON client_requests TO CURRENT_USER;
