#!/usr/bin/env bash
# Apply migrations in order. Usage: DATABASE_URL=... bash scripts/migrate.sh
# Idempotent: applied files are recorded in schema_migrations and skipped.
# Safe to re-run on every `docker compose up` (migrate service, restarts).
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL must be set}"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
FILES="001_schema.sql 002_seed_footwear.sql 013_pilot_workspace.sql 004_requests.sql 005_extraction_status.sql 006_supplier_wiring.sql 007_memberships.sql 008_extraction_jobs.sql 009_invites.sql 010_extracting_status.sql 011_document_items.sql 012_request_notifications.sql"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
  "CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())" >/dev/null

# Baseline: a DB that already has the workspaces table but no tracking rows was
# migrated by an older loop or the 000 Supabase one-shot — mark everything
# applied so a re-run doesn't choke on non-idempotent DDL (001 CREATE TABLE).
if [ "$(psql "$DATABASE_URL" -tAX -c "SELECT COUNT(*) FROM schema_migrations")" = "0" ] \
  && [ "$(psql "$DATABASE_URL" -tAX -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_name='workspaces'")" = "1" ]; then
  for f in $FILES; do
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
      "INSERT INTO schema_migrations (filename) VALUES ('$f') ON CONFLICT DO NOTHING" >/dev/null
  done
  echo "Baseline: workspaces table pre-exists, marked ${FILES} as applied."
fi

for f in $FILES; do
  if [ "$(psql "$DATABASE_URL" -tAX -c "SELECT COUNT(*) FROM schema_migrations WHERE filename='$f'")" = "1" ]; then
    echo "Skipping $f (already applied)"
    continue
  fi
  echo "Applying $f"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$DIR/migrations/$f"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
    "INSERT INTO schema_migrations (filename) VALUES ('$f')" >/dev/null
done
echo "Done."
echo "NOTE: 000_pilot_bootstrap.sql is a Supabase-SQL-Editor one-shot (not in loop)."
echo "NOTE: 003_audit_grants.sql is a manual template (not in loop);"
echo "then run: python scripts/verify_audit_grants.py"
