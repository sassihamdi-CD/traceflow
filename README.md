# TraceFlow API (FastAPI)

Pilot backend for TraceFlow AI. See repo root `migrations/` and `.env.example`.

## Founder clone-and-run on Windows (one command, PowerShell)

```powershell
git clone <repo-url> tracflow; cd tracflow
.\pilot-windows.bat
```

(Or double-click `pilot-windows.bat` in Explorer.) From PowerShell you can
also run the script directly:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\pilot-windows.ps1
```

> NOTE: in PowerShell, `&` does NOT chain commands (use `;`) and local
> scripts need the `.\` prefix — that is why bare `pilot-windows.bat`
> fails with "command not found".

The script automates everything: detects x64/ARM64, installs missing
prerequisites (Git, Python 3.12, Docker Desktop via winget), creates `.env`
from `.env.example` with a random local `DB_APP_PASSWORD`, bridges your
backend keys into the frontend build args, kills any stale process on the
pilot ports, runs `docker compose up --build` (**backend API + Postgres +
worker + Next.js console — Docker installs everything, no local Node
needed**), waits for `/health` + `/ready` + the web console, and opens the
pilot console in the browser (`http://localhost:3000`).

Options: `-Port 8001` (use another port), `-NoDocker` (venv + uvicorn,
no containers), `-NoBrowser` (don't auto-open the browser), `-Rebuild`
(force image rebuild), `-EnvFile "C:\Users\you\Downloads\.env"` (import a
`.env` file you received privately). Without Docker it falls back to a local
venv automatically (asks before installing Docker Desktop).

### Real keys (Supabase / Anthropic / R2) — read this

The repo only contains `.env.example` **placeholders** — the real keys live
in your private `.env`, which is git-ignored and must NEVER be committed
(anyone with your `ANTHROPIC_API_KEY` can burn your budget).
To give your friend the full pilot (login + AI extraction + file storage):

1. Send YOUR backend `.env` file privately (WhatsApp / Signal / encrypted mail).
2. Append your `tracflow-web/.env.local` lines (the 4 `NEXT_PUBLIC_*` values)
   to that same file — or let the script bridge `SUPABASE_*` automatically
   (it copies them into `NEXT_PUBLIC_*`; only the invite code then stays
   placeholder unless provided).
3. Friend saves it anywhere, e.g. `Downloads\.env`, then runs:
   `.\pilot-windows.bat -EnvFile "$env:USERPROFILE\Downloads\.env"`
   (or copies it to `.env` in the repo root manually).
4. After ANY key change: re-run with `-Rebuild` (or
   `docker compose up --build`) — `NEXT_PUBLIC_*` values are baked into the
   web image at build time.
5. Without real keys the pilot still runs in the browser (console landing +
   `/passport`, API `/docs`, `/health`, `/ready` all work on local
   Postgres) — only login-gated routes (need `SUPABASE_*`), AI extraction
   (needs `ANTHROPIC_API_KEY`) and uploads (need `R2_*`) stay disabled. The
   script prints exactly which keys are real vs placeholder on every run.

## Founder clone-and-run on Linux/macOS (Docker, recommended)

```bash
git clone <repo-url> tracflow && cd tracflow
cp .env.example .env   # fill SUPABASE_*, ANTHROPIC_API_KEY, DB_APP_PASSWORD
docker compose up --build
curl localhost:8000/health   # expect {"ok": true}
curl localhost:8000/ready    # expect {"ok": true, "db": "up"}
```

Services: `api` (FastAPI), `worker` (extraction queue), `db` (Postgres 16),
`migrate` (one-shot `scripts/migrate.sh`), `web` (Next.js pilot console on
`${WEB_PORT:-3000}`, built from `./web` — needs no local Node).

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
