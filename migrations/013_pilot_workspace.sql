-- Pilot workspace seed for fresh databases (docker compose / local Postgres).
-- The Supabase one-shot 000_pilot_bootstrap.sql contains this row too; both use
-- ON CONFLICT DO NOTHING so applying both is safe. migrate.sh runs this file
-- right after 002 so later migrations (007 memberships seed) satisfy the
-- workspaces FK on a brand-new database.
-- Workspace id must match WORKSPACE_ID in the backend .env.
INSERT INTO workspaces (id, name)
VALUES ('4db22bd4-77a6-4013-91c7-7e8936680909', 'Pilot manufacturer')
ON CONFLICT (id) DO NOTHING;
