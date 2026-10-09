-- 014: truncation flag on documents.
-- Any pipeline cap that cuts extraction short (xlsx/csv 500-row table cap,
-- document_items 200-item / 500-char caps, parties 12-cap) sets
-- extraction_truncated = TRUE so the reviewer sees "truncated" next to the
-- document instead of silently incomplete evidence.
-- Idempotent: safe to re-run (IF NOT EXISTS guard).

ALTER TABLE documents ADD COLUMN IF NOT EXISTS extraction_truncated BOOLEAN NOT NULL DEFAULT FALSE;
