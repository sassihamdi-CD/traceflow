#!/usr/bin/env bash
# Apply migrations in order. Usage: DATABASE_URL=... bash scripts/migrate.sh
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL must be set}"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
for f in "$DIR"/migrations/001_schema.sql "$DIR"/migrations/002_seed_footwear.sql "$DIR"/migrations/004_requests.sql "$DIR"/migrations/005_extraction_status.sql "$DIR"/migrations/006_supplier_wiring.sql "$DIR"/migrations/007_memberships.sql "$DIR"/migrations/008_extraction_jobs.sql "$DIR"/migrations/009_invites.sql "$DIR"/migrations/010_extracting_status.sql "$DIR"/migrations/011_document_items.sql "$DIR"/migrations/012_request_notifications.sql; do
  echo "Applying $f"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done
echo "Done."
echo "NOTE: 000_pilot_bootstrap.sql is a Supabase-SQL-Editor one-shot (not in loop)."
echo "NOTE: 003_audit_grants.sql is a manual template (not in loop);"
echo "then run: python scripts/verify_audit_grants.py"
