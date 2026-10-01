-- 010: allow 'extracting' status (set by upload path at insert).
-- P0 set new documents to extraction_status='extracting', but 005's CHECK
-- only allowed pending/done/failed -> 500 on every upload. Idempotent.
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_extraction_status_check;
ALTER TABLE documents ADD CONSTRAINT documents_extraction_status_check
  CHECK (extraction_status IN ('pending','extracting','done','failed'));
