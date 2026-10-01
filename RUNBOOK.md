# TraceFlow Pilot — Runbook (copy-paste steps)

## Step 1 — Database bootstrap (Supabase SQL Editor, ~2 min, no password needed)

1. Open Supabase Dashboard → the TraceFlow project → **SQL Editor** → **New query**.
2. On your machine open this file and copy ALL of it:
   `tracflow/migrations/000_pilot_bootstrap.sql`
3. Paste into the SQL Editor → **Run**.
4. ✅ DONE 2026-09-21 — verified live: `field_definitions = 7`,
   `workspaces = 1`, role `traceflow_app` exists. Grants applied by the
   same script (audit_log: SELECT+INSERT only, UPDATE/DELETE never granted).

What the script does (idempotent, safe to re-run):
schema (8 tables, no pgvector) → 7 footwear seed rows →
workspace row `4db22bd4-…` → `traceflow_app` role →
insert-only `audit_log` grants (SELECT+INSERT, UPDATE/DELETE never granted).

## Step 2 — Backend boot check (local)

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pytest -q            # expect 20 passed
uvicorn app.main:app # expect "Application startup complete"
curl localhost:8000/health   # expect {"ok": true}
```

## Step 3 — AI extraction needs this ONE key

✅ DONE 2026-09-21 — key stored in `.env`, verified live against the Claude
API (`TRACEFLOW-OK` round-trip) AND end-to-end on a synthetic supplier table:
4/4 fields mapped with exact `Sheet 1 / <cell>` coordinates, sanitizer clean.
(The live test also caught a real bug — fenced/prose-wrapped JSON crashed the
parser — fixed with a tolerant parser + 4 new tests. Suite: 29 passed.)

## Step 4 — Frontend (only after 1–3 are green)

```bash
npm install && npm run dev   # http://localhost:3000
```

## Still outstanding

- Supabase DB password direct-connect test: BLOCKED from here (no IPv6
  route on this machine). SQL Editor path above replaces it.
- `NEXT_PUBLIC_API_URL`: set to the Railway URL once the API is deployed.
- Supabase Redirect URLs allowlist: add the deployed web URL so magic
  links land on TraceFlow (`/products`), not the project Site URL.
