"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { Fingerprint } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { apiRedeemInvite, type InviteRedeemResult } from "@/lib/api";

/** Reviewer auth: email + password, self-service.
 * Signup is gated by a pilot invite code (NEXT_PUBLIC_PILOT_INVITE_CODE).
 * Requires Supabase Dashboard > Authentication > Providers > Email >
 * "Confirm email" OFF, so signup creates an active session with zero emails
 * and zero redirect URLs. Lock down (confirmations / SSO) post-pilot. */
export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [redeemCode, setRedeemCode] = useState("");
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [redeemError, setRedeemError] = useState("");
  const [redeemed, setRedeemed] = useState<InviteRedeemResult | null>(null);

  useEffect(() => {
    let live = true;
    createClient().auth.getSession().then(({ data }) => {
      if (live && data.session) setAuthed(true);
    });
    return () => { live = false; };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setBusy(true);
    const supabase = createClient();
    if (tab === "up") {
      const expected = process.env.NEXT_PUBLIC_PILOT_INVITE_CODE || "";
      if (expected && code.trim() !== expected) {
        setError("Invalid pilot invite code.");
        setBusy(false);
        return;
      }
      const { error } = await supabase.auth.signUp({ email, password });
      setBusy(false);
      if (error) {
        setError(error.message);
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setAuthed(true);
        router.push("/products");
        router.refresh();
        return;
      }
      router.push("/products");
      router.refresh();
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setAuthed(true);
    router.push("/products");
    router.refresh();
  }

  async function redeem(e: React.FormEvent) {
    e.preventDefault();
    setRedeemError(""); setRedeemed(null); setRedeemBusy(true);
    try {
      const res = await apiRedeemInvite(redeemCode.trim());
      setRedeemed(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Redeem failed";
      if (msg === "SESSION_EXPIRED") {
        router.push("/login");
        return;
      }
      setRedeemError(msg);
    } finally {
      setRedeemBusy(false);
    }
  }

  const inputCls =
    "mt-2 min-h-[44px] w-full rounded-lg border border-line bg-paper px-3.5 text-[15px] outline-none transition-shadow duration-150 placeholder:text-muted/70 focus:border-ink focus:ring-2 focus:ring-ink/15";

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="animate-rise w-full max-w-md rounded-xl2 border border-line bg-white/70 p-8 shadow-pop">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink text-paper">
          <Fingerprint size={20} />
        </span>
        <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight">Reviewer access</h1>
        <div className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-parchment p-1">
          {(["in", "up"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { setTab(t); setError(""); }}
              className={clsx(
                "min-h-[40px] rounded-lg text-sm font-semibold transition-colors duration-150",
                tab === t ? "bg-ink text-paper shadow-card" : "text-inksoft hover:text-ink",
              )}
            >
              {t === "in" ? "Sign in" : "Create account"}
            </button>
          ))}
        </div>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted" htmlFor="email">
              Email
            </label>
            <input id="email" type="email" required autoComplete="email" placeholder="reviewer@manufacturer.com"
              value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted" htmlFor="password">
              Password {tab === "up" && <span className="normal-case tracking-normal">(min 6 characters)</span>}
            </label>
            <input id="password" type="password" required autoComplete={tab === "up" ? "new-password" : "current-password"}
              placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} />
          </div>
          {tab === "up" && (
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted" htmlFor="code">
                Pilot invite code
              </label>
              <input id="code" type="text" required autoComplete="off" placeholder="Ask the pilot admin"
                value={code} onChange={(e) => setCode(e.target.value)} className={inputCls} />
            </div>
          )}
          <button type="submit" disabled={busy}
            className="min-h-[44px] w-full rounded-xl bg-ink font-semibold text-paper transition-transform duration-150 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50">
            {busy ? "Please wait…" : tab === "in" ? "Sign in" : "Create account & enter"}
          </button>
        </form>
        {error && <p className="mt-4 text-sm font-medium text-brick">{error}</p>}
        {authed && (
          <form onSubmit={redeem} className="mt-6 space-y-3 border-t border-line pt-5">
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted" htmlFor="redeem">
              Redeem invite
            </label>
            <input id="redeem" type="text" autoComplete="off" placeholder="Paste invite code"
              value={redeemCode} onChange={(e) => setRedeemCode(e.target.value)} className={inputCls} />
            <button type="submit" disabled={redeemBusy || !redeemCode.trim()}
              className="min-h-[44px] w-full rounded-xl bg-ink font-semibold text-paper transition-transform duration-150 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50">
              {redeemBusy ? "Redeeming…" : "Redeem invite"}
            </button>
            {redeemError && <p className="text-sm font-medium text-brick">{redeemError}</p>}
            {redeemed && (
              <p className="text-sm font-medium text-ink">
                Joined workspace {redeemed.workspace || "(unknown)"} as {redeemed.role || "(unknown)"}.{" "}
                <button type="button" onClick={() => router.push("/products")} className="underline">
                  Continue to products →
                </button>
              </p>
            )}
          </form>
        )}
        <p className="mt-5 text-center text-xs text-muted">
          Password change anytime under Account. No emails are ever sent by this app.
        </p>
      </div>
    </main>
  );
}
