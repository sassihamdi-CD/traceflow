-- 015: enforce insert-only audit_log at the grant level (per company DB).
-- Idempotent. Replaces the manual 003_audit_grants.sql template for
-- migrate.sh-managed databases (docker compose / per-company Postgres).
-- Supabase one-shot DBs already got these grants from 000_pilot_bootstrap.sql.
--
-- Verify per company DB after migrate:
--   python scripts/verify_audit_grants.py  (DATABASE_URL=<app-role-url>)

DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'traceflow_app') THEN
    REVOKE ALL ON TABLE audit_log FROM traceflow_app;
    GRANT SELECT, INSERT, UPDATE ON client_requests TO CURRENT_USER;
  END IF;
END
$$;
