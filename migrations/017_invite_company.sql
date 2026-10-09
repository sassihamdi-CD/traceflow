-- Founder company info on invite codes (shown on /founder, never to manufacturers).
ALTER TABLE invites ADD COLUMN IF NOT EXISTS company_name TEXT NOT NULL DEFAULT '';
ALTER TABLE invites ADD COLUMN IF NOT EXISTS contact_name TEXT NOT NULL DEFAULT '';
ALTER TABLE invites ADD COLUMN IF NOT EXISTS contact_email TEXT NOT NULL DEFAULT '';
