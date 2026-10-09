# Per-company provisioning (SEPARATE DB per manufacturer)

Decision 2026-10-07: one isolated Postgres database per manufacturer company.
No shared DB, no cross-company tokens. Repeat this checklist once per company.

## 1. Per-company env file (`.env.<company>` — never commit real secrets)

```bash
cp .env.example .env.acme
# edit .env.acme:
DATABASE_URL=postgresql://traceflow_app:<DB_APP_PASSWORD>@<host>:5432/traceflow_acme
DB_APP_PASSWORD=<openssl rand -hex 32>          # unique per company
WORKSPACE_ID=<uuidgen>                          # unique per company, e.g. 4db22bd4-…
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=<per-company key>
R2_SECRET_ACCESS_KEY=<per-company secret>
R2_BUCKET=traceflow-docs                        # shared bucket OK: isolation is the prefix below
INTAKE_SECRET=<openssl rand -hex 32>            # unique per company
PILOT_INVITE_CODE=<fresh random code>           # server-side signup gate, unique per company
PORT=8000
WEB_PORT=3000
NEXT_PUBLIC_API_URL=https://api-<company>.example.com
NEXT_PUBLIC_SUPABASE_URL=https://xyz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
# PUBLIC (JS bundle) — UX hint only, never a gate. May mirror PILOT_INVITE_CODE or stay unset.
NEXT_PUBLIC_PILOT_INVITE_CODE=<same-as-pilot-code-or-empty>
```

R2 layout enforced in code (`app/services/storage.py::new_storage_key`):
`{workspace_id}/{product_id}/{uuid}-{basename}` — one prefix per company.

## 2. Migrate (baseline bug fixed)

```bash
DATABASE_URL="<company-url>" bash scripts/migrate.sh
```

- `migrate.sh` records in `schema_migrations` and is idempotent.
- Baseline fix: DBs created by the old Supabase one-shot (`000`) only get
  `001/002/013` marked applied; `004–012` still RUN (they create
  `client_requests`, `memberships`, `invites`, `extraction_jobs`,
  `document_items`, `notifications`, …). The old loop marked everything
  applied and left those tables missing.
- New: `014_invite_hygiene.sql` (revokes compromised `TF-133C98`, bounds
  invites to `max_uses` + `expires_at`), `015_audit_insert_only.sql`
  (enforces `audit_log` SELECT+INSERT for `traceflow_app`).

Then seed the workspace row matching `.env.<company>`:

```sql
INSERT INTO workspaces (id, name)
VALUES ('<WORKSPACE_ID>', '<Company display name>')
ON CONFLICT (id) DO NOTHING;
```

Writes with an unseeded `WORKSPACE_ID` now fail with HTTP 409
("Workspace not provisioned …"), not a 500 FK violation
(`app/auth.py::ensure_workspace_exists`, called by every mutating route).

## 3. Invite hygiene (per company)

Compromised seed `TF-133C98` (`457a99ba…`) is revoked by migration 014 and
must never be reused. Create a fresh invite per company:

Preferred (no terminal — founder clicks it):

Open the company's console → **Invite codes** → type the company short name +
seats → **Generate code** → copy the message → send it (WhatsApp/email).
One code per company, shared with everyone there.

Fallback (one command, inside the api container network):

```bash
docker exec -e WORKSPACE_ID='<WORKSPACE_ID>' tracflow-api-1 \
  python scripts/make_invite.py --prefix ACME --uses 5 --days 90
# → prints the ONE company code to hand out (signup redeems it automatically).
```

- PILOT = single role: whoever joins with the company code owns the
  workspace and can do everything (upload, review, publish). No promotions,
  no tiers. The `role` column is informational only.
- Every invite MUST set `max_uses` AND `expires_at` (unlimited codes are rejected in review).

## 4. Signup (single company code)

- Signup takes email + password + the ONE company code, and instantly joins
  the workspace — no second redeem step (`web/app/login/page.tsx`).
- The legacy `NEXT_PUBLIC_PILOT_INVITE_CODE` / `/api/invites/signup-gate`
  path is unused; the invite code itself is the gate.

## 5. Verify per company DB

```bash
# audit_log must be insert-only for the app role:
DATABASE_URL="<app-role-url>" python scripts/verify_audit_grants.py
# expect: UPDATE denied, DELETE denied, SELECT allowed

# workspace boot check (write with bad WORKSPACE_ID -> 409, not 500):
# set WORKSPACE_ID to a random uuid, POST /api/products -> 409 "Workspace not provisioned"

# isolation: Company A token on Company B product id -> 404 (never 200, never cross rows)
curl -H "Authorization: Bearer <A-token>" $B_API/api/products/<B-product-id>  # 404
curl -H "Authorization: Bearer <A-token>" $A_API/api/products/<B-product-id>  # 404

# R2 prefix: upload a doc, confirm key starts with "<WORKSPACE_ID>/<product_id>/"
psql "$DATABASE_URL" -c "SELECT storage_key FROM documents ORDER BY uploaded_at DESC LIMIT 1"

# auth fail-closed: stop Postgres, GET /api/products with valid token -> 503 (never 200 with reviewer rights)
```

## 6. Auth model (why GETs require membership)

- `app/auth.py::get_caller` validates the Supabase session, then resolves
  `workspace_id`/`role` from `memberships`. DB error → HTTP 503 (never mints rights).
  No membership row → role `"none"`.
- `require_member` (admin/reviewer/supplier/auditor) guards ALL console
  reads (`GET /api/products`, `/api/documents/*`, `/api/requests*`,
  `/api/review-queue`, `/api/activity`, `/api/suppliers`, `/api/notifications*`,
  `POST /api/ask`). Non-members get 403 and must redeem an invite first.
- `POST /api/invites/redeem` stays on auth-only `get_caller` (a new user has
  no membership yet — requiring one would deadlock redemption).
- Public passport (`/api/public/passport/*`) stays unauthenticated by design
  (verified-only SQL, slug lookup, 404 on unpublished).

## 7. Rate limits + headers

- `app/main.py` sends `HSTS` + `CSP: default-src 'none'` (+ nosniff/DENY/no-referrer).
- Enforce at the edge per company DB:
  `redeem` + `signup-gate`: 10 req/min/IP (429 + Retry-After);
  `intake/email`: 60 req/min/IP + `X-Intake-Secret`;
  general `/api/*`: 300 req/min/IP.
