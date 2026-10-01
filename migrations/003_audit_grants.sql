-- Enforce insert-only audit_log at the database grant level (spec section 1 + 3).
-- Apply after creating the application role. Replace app_role with the real role name.
-- Usage: psql $DATABASE_URL -f 003_audit_grants.sql  (with APP_ROLE substituted)

-- REVOKE ALL, then grant only SELECT + INSERT:
--   REVOKE ALL ON audit_log FROM :APP_ROLE;
--   GRANT SELECT, INSERT ON audit_log TO :APP_ROLE;

-- Manual verification (must FAIL before moving on from Phase 1):
--   UPDATE audit_log SET action = 'tampered' WHERE id = '<any-id>';
--   -- expected: ERROR: permission denied for table audit_log
--   DELETE FROM audit_log WHERE id = '<any-id>';
--   -- expected: ERROR: permission denied for table audit_log

-- Concrete statements (uncomment and set role name for Supabase/Neon):
-- REVOKE ALL ON TABLE audit_log FROM traceflow_app;
-- GRANT SELECT, INSERT ON TABLE audit_log TO traceflow_app;
