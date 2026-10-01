-- 006: supplier wiring. Documents remember detected organizations so the
-- reviewer links them in one click instead of retyping names from PDFs.
-- Idempotent.

ALTER TABLE documents ADD COLUMN IF NOT EXISTS detected_parties JSONB NOT NULL DEFAULT '[]';
