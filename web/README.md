# TraceFlow web (Next.js 14, Vercel)

Reviewer console with a fixed left sidebar — Dashboard (`/products`), Requests
(`/requests`, six-stage workflow per client request: request → structure →
evidence → verify → gaps → respond), Review queue (`/review`, FIFO
accept/reject with pending-count badge), Suppliers, Activity (audit trail),
Account — plus the unauthenticated public passport (`/passport/[slug]`).

```bash
cp .env.example .env.local  # fill Supabase + NEXT_PUBLIC_API_URL
npm install
npm run dev
```

## Design system: "evidence ledger" (industrial-refined)

- Paper `#FAF7F1` / ink `#1B1814`, moss (verified), amber (proposed), brick (conflict).
- Fraunces (display) + Inter (UI, tabular nums) + IBM Plex Mono (evidence refs, SKUs).
- Tokens in `tailwind.config.js`; entrance via CSS `animate-rise` keyframes
  (runs pre-hydration, `prefers-reduced-motion` safe); `motion` kept only for
  the readiness ring progress. No purple gradients, no blobs, no cards-in-cards.
- Icons: `lucide-react`, 40px+ hit areas, explicit transition properties only.

## Auth: email + password, self-signup with invite code (zero emails)

1. Supabase Dashboard → Authentication → Providers → Email → **Confirm email OFF**.
   (This is what removes all email links/redirects from the flow.)
2. Reviewers open `/login` → **Create account** with email + password + the
   pilot invite code (`NEXT_PUBLIC_PILOT_INVITE_CODE`), and land straight in
   the console. Sign-in after that is email + password at any time.
3. Password change: `/account`. Forgotten password: admin resets in the
   Dashboard Users panel (recovery emails out of scope for the pilot).
4. Post-pilot lockdown: re-enable confirmations or SSO and drop the code gate.

- `middleware.ts` lets `/passport/*` through with no session; console routes
  redirect to `/login` without a Supabase cookie; session refresh via
  `utils/supabase/*` (`@supabase/ssr`).
- `lib/api.ts:apiPublicPassport` sends no `Authorization` header and only
  calls the isolated backend public route (verified-only SQL, label/value/unit).
- No email templates, redirect URLs, or OAuth providers are needed: the app
  sends zero emails (password resets happen in the Dashboard Users panel).
