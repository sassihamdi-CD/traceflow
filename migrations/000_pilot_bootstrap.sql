-- ============================================================
-- TraceFlow pilot bootstrap: ONE paste into Supabase SQL Editor.
-- Dashboard > SQL Editor > New query > paste ALL of this > Run.
-- Idempotent: safe to run twice (IF NOT EXISTS / ON CONFLICT guards).
-- ============================================================

-- ---- 1. Schema (no pgvector) ----
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  manufacturer_name TEXT NOT NULL,
  public_slug TEXT NOT NULL UNIQUE,
  passport_published BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  external_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  product_id UUID NOT NULL REFERENCES products(id),
  supplier_id UUID REFERENCES suppliers(id),
  filename TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  page_count INT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS field_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  field_key TEXT NOT NULL,
  label TEXT NOT NULL,
  required BOOLEAN NOT NULL DEFAULT TRUE,
  display_order INT NOT NULL,
  UNIQUE (category, field_key)
);

CREATE TABLE IF NOT EXISTS field_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  product_id UUID NOT NULL REFERENCES products(id),
  field_key TEXT NOT NULL,
  value TEXT NOT NULL,
  unit TEXT,
  status TEXT NOT NULL CHECK (status IN ('proposed','accepted','corrected','rejected')),
  document_id UUID REFERENCES documents(id),
  location TEXT,
  extracted_by TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  supersedes_id UUID REFERENCES field_values(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS supplier_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  product_id UUID NOT NULL REFERENCES products(id),
  field_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','sent','replied','resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  detail JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_field_values_product_field ON field_values(product_id, field_key);
CREATE INDEX IF NOT EXISTS idx_field_values_status ON field_values(status);
CREATE INDEX IF NOT EXISTS idx_documents_product ON documents(product_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log(entity_type, entity_id);

-- ---- 2. Seed: footwear field definitions ----
INSERT INTO field_definitions (category, field_key, label, required, display_order) VALUES
  ('footwear', 'product_name',      'Product name',      TRUE, 1),
  ('footwear', 'sku',               'SKU',               TRUE, 2),
  ('footwear', 'upper_material',    'Upper material',    TRUE, 3),
  ('footwear', 'upper_composition', 'Upper composition', TRUE, 4),
  ('footwear', 'leather_origin',    'Leather origin',    TRUE, 5),
  ('footwear', 'sole_material',     'Sole material',     TRUE, 6),
  ('footwear', 'reach_compliance',  'REACH compliance',  TRUE, 7)
ON CONFLICT (category, field_key) DO NOTHING;

-- ---- 3. Pilot workspace row (id matches WORKSPACE_ID in backend .env) ----
INSERT INTO workspaces (id, name) VALUES ('4db22bd4-77a6-4013-91c7-7e8936680909', 'Pilot manufacturer')
ON CONFLICT (id) DO NOTHING;

-- ---- 4. App role: insert-only audit_log enforced at grant level ----
-- SECURITY: set the password via psql variable, never commit a real one.
--   psql -v app_password="$DB_APP_PASSWORD" -f migrations/000_pilot_bootstrap.sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'traceflow_app') THEN
    CREATE ROLE traceflow_app WITH LOGIN PASSWORD :'app_password';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE postgres TO traceflow_app;
GRANT USAGE ON SCHEMA public TO traceflow_app;
GRANT SELECT ON workspaces TO traceflow_app;
GRANT SELECT, INSERT, UPDATE ON products, suppliers, documents, field_definitions, field_values, supplier_followups TO traceflow_app;
-- audit_log: SELECT + INSERT only. UPDATE/DELETE are never granted,
-- so the app role is structurally incapable of rewriting history.
REVOKE ALL ON audit_log FROM traceflow_app;
GRANT SELECT, INSERT ON audit_log TO traceflow_app;

-- ---- 5. Verify (reads back what was created) ----
SELECT 'field_definitions' AS t, COUNT(*) AS n FROM field_definitions
UNION ALL SELECT 'workspaces', COUNT(*) FROM workspaces;
SELECT rolname FROM pg_roles WHERE rolname = 'traceflow_app';
-- Expected: field_definitions = 7, workspaces >= 1, one row 'traceflow_app'.
