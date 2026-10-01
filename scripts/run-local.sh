#!/usr/bin/env bash
# Local run: API against the throwaway docker DB (Supabase is unreachable
# from this machine — no IPv6 route). Production uses .env DATABASE_URL.
# Usage: bash scripts/run-local.sh  (then open http://localhost:3001)
set -euo pipefail
export DATABASE_URL='postgresql://traceflow_app:tracflow-local-test@localhost:5434/traceflow'
exec .venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
