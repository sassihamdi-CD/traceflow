# Login invite redeem
1. Sign in (or sign up) on /login to establish a Supabase session.
2. Paste invite code into "Redeem invite" → POST /api/invites/redeem {code}.
3. Success creates workspace membership; UI shows workspace + role.
4. Errors show inline; SESSION_EXPIRED redirects to /login.
5. Signup pilot-code check (NEXT_PUBLIC_PILOT_INVITE_CODE) is UX-only.
6. Server-side invite gate is primary; never rely on client check.
7. Harden Supabase dashboard: disable open signup when pilot ends.
8. Turn "Confirm email" ON post-pilot; keep OFF only during pilot.
9. Enforce SSO/MFA post-pilot; rotate pilot codes; audit members.
