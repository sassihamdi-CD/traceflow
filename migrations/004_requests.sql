-- 004: request-centric workflow (client requests drive stages 1-6).
-- Idempotent. Also pasted into Supabase SQL Editor after 000 bootstrap.

CREATE TABLE IF NOT EXISTS client_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  product_id UUID NOT NULL REFERENCES products(id),
  requester_name TEXT NOT NULL,
  requester_org TEXT,
  subject TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','responded')),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_requests_product ON client_requests(product_id);

-- Supplier follow-up composer fields (draft + copy only; nothing is sent).
ALTER TABLE supplier_followups ADD COLUMN IF NOT EXISTS recipient TEXT;
ALTER TABLE supplier_followups ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE supplier_followups ADD COLUMN IF NOT EXISTS items JSONB;

-- Document validity for the "out of date" gap counter (nullable: unknown = not dated).
ALTER TABLE documents ADD COLUMN IF NOT EXISTS valid_until DATE;

-- App-role grants for the new table/columns (audit_log stays SELECT+INSERT only).
GRANT SELECT, INSERT, UPDATE ON client_requests TO traceflow_app;
