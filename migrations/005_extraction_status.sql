-- 005: per-document extraction status (no more silent background work).
-- Idempotent.

ALTER TABLE documents ADD COLUMN IF NOT EXISTS extraction_status TEXT NOT NULL DEFAULT 'pending'
  CHECK (extraction_status IN ('pending','done','failed'));
ALTER TABLE documents ADD COLUMN IF NOT EXISTS extracted_count INT NOT NULL DEFAULT 0;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS extraction_error TEXT;
