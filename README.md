# TraceFlow API (FastAPI)

Pilot backend for TraceFlow AI. See repo root `migrations/` and `.env.example`.

## Founder clone-and-run on Windows (one command)

```bat
git clone <repo-url> tracflow & cd tracflow
pilot-windows.bat
```

Double-click `pilot-windows.bat`, or from PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\pilot-windows.ps1
```

The script automates everything: detects x64/ARM64, installs missing
prerequisites (Git, Python 3.12, Docker Desktop via winget), creates `.env`
from `.env.example` with a random local `DB_APP_PASSWORD`, kills any stale
process on the pilot port, runs `docker compose up --build`, waits for
`/health` + `/ready`, and opens the pilot in the browser
(`http://localhost:8000/docs` — this repo is API-only, Swagger UI is the UI).

Options: `-Port 8001` (use another port), `-NoDocker` (venv + uvicorn,
no containers), `-NoBrowser` (don't auto-open the browser), `-Rebuild`
(force image rebuild). Without Docker it falls back to a local venv
automatically (asks before installing Docker Desktop).

## Founder clone-and-run on Linux/macOS (Docker, recommended)

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

Windows (PowerShell) equivalent:

```powershell
py -3 -m venv .venv; .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
pytest -q
# local run without Docker: powershell -NoProfile -ExecutionPolicy Bypass -File scripts\run-local.ps1
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
