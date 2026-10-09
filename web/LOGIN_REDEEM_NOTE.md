# Login (manufacturers) + founder area
1. Founder opens /founder (separate page, founder key — NOT the portal),
   fills company + contact + seats, generates ONE company code, sends it.
2. Manufacturer opens /login → Create account → email + password + company
   code. The code is checked BEFORE the account is created, then auto-joined.
   No second step, no redeem box.
3. Afterwards: email + password only. Session persists; logout/login resumes
   the last page. A join box appears ONLY if signed in but not yet a member
   (rare edge: code ran out mid-signup).
4. One code per company, shared with everyone there (seats = headcount).
5. The old "Redeem invite" box is gone. Manufacturer portal = /login + console.
6. Post-pilot: Confirm email ON, disable open signup, SSO/MFA, rotate codes.
