# TraceFlow API (FastAPI)

Pilot backend for TraceFlow AI. See repo root `migrations/` and `.env.example`.

## Founder clone-and-run (Docker, recommended)

```bash
git clone <repo-url> tracflow && cd tracflow
cp .env.example .env   # fill SUPABASE_*, ANTHROPIC_API_KEY, DB_APP_PASSWORD
docker compose up --build
curl localhost:8000/health   # expect {"ok": true}
curl localhost:8000/ready    # expect {"ok": true, "db": "up"}
```

Services: `api` (FastAPI), `worker` (extraction queue), `db` (Postgres 16),
`migrate` (one-shot `scripts/migrate.sh`).

## Quickstart (no keys needed for unit tests)

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pytest -q
```

## With keys (Phase 1 auth setup)

Copy `.env.example` to `.env` and fill `DATABASE_URL`, `SUPABASE_*`,
`WORKSPACE_ID`, `R2_*`, `ANTHROPIC_API_KEY`. Then:

```bash
psql $DATABASE_URL -f migrations/001_schema.sql
psql $DATABASE_URL -f migrations/002_seed_footwear.sql
# edit role name in 003_audit_grants.sql, apply, then run the manual
# failed-UPDATE check documented in that file
uvicorn app.main:app --reload
```

## Corrections applied (v2)

1. Extraction branches by file type: PDF native to Claude, XLSX via
   openpyxl (real `Sheet / Cell` coordinates), CSV via pandas, unknown
   types rejected 415 at upload.
2. No pgvector in `001_schema.sql`.
3. `WORKSPACE_ID` env constant in `app/config.py`, used by `app/auth.py`;
   no user->workspace lookup table.
