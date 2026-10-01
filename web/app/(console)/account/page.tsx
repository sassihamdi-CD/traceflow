"use client";
import { useEffect, useState } from "react";
import { KeyRound, PenLine } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { loadSignature, saveSignature, type EmailSignature } from "@/lib/fieldMeta";

/** Change password for the signed-in reviewer. Pilot note: Supabase lets an
 * authenticated user set a new password directly; forgotten-password email
 * recovery is intentionally out of scope (admin resets via Dashboard). */
export default function AccountPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  const [isError, setIsError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function change(e: React.FormEvent) {
    e.preventDefault();
    setMsg(""); setIsError(false);
    if (password.length < 8) {
      setIsError(true); setMsg("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setIsError(true); setMsg("Passwords do not match.");
      return;
    }
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setIsError(true); setMsg(error.message);
      return;
    }
    setPassword(""); setConfirm("");
    setMsg("Password changed.");
  }

  return (
    <>
      <div className="animate-rise max-w-xl">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">Reviewer</p>
        <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">Account</h1>
        <form onSubmit={change} className="mt-6 space-y-4 rounded-xl2 border border-line bg-white/70 p-6 shadow-card">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-parchment text-ink">
              <KeyRound size={19} />
            </span>
            <h2 className="font-display text-lg font-semibold">Change password</h2>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted" htmlFor="np">
              New password
            </label>
            <input
              id="np"
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 min-h-[44px] w-full rounded-lg border border-line bg-paper px-3.5 text-[15px] outline-none transition-shadow duration-150 focus:border-ink focus:ring-2 focus:ring-ink/15"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted" htmlFor="cf">
              Confirm new password
            </label>
            <input
              id="cf"
              type="password"
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-2 min-h-[44px] w-full rounded-lg border border-line bg-paper px-3.5 text-[15px] outline-none transition-shadow duration-150 focus:border-ink focus:ring-2 focus:ring-ink/15"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="min-h-[44px] rounded-xl bg-ink px-6 font-semibold text-paper transition-transform duration-150 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
          >
            {busy ? "Saving…" : "Set new password"}
          </button>
          {msg && <p className={`text-sm font-medium ${isError ? "text-brick" : "text-moss-deep"}`}>{msg}</p>}
        </form>
        <SignatureForm />
      </div>
    </>
  );
}

function SignatureForm() {
  const [sig, setSig] = useState<EmailSignature>({ name: "", title: "", company: "", phone: "" });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSig(loadSignature());
  }, []);

  const inputCls =
    "mt-2 min-h-[44px] w-full rounded-lg border border-line bg-paper px-3.5 text-[15px] outline-none transition-shadow duration-150 placeholder:text-muted/70 focus:border-ink focus:ring-2 focus:ring-ink/15";

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); saveSignature(sig); setSaved(true); setTimeout(() => setSaved(false), 2000); }}
      className="mt-4 space-y-4 rounded-xl2 border border-line bg-white/70 p-6 shadow-card"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-parchment text-ink">
          <PenLine size={19} />
        </span>
        <div>
          <h2 className="font-display text-lg font-semibold">Email signature</h2>
          <p className="text-[13px] text-inksoft">Appended to every supplier email you draft. Stored in this browser.</p>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {([["name", "Full name", "Marco Rossi"], ["title", "Title", "Product Data, Nova Footwear"], ["company", "Company", "Nova Footwear"], ["phone", "Phone", "+39 …"]] as const).map(([k, label, hint]) => (
          <div key={k}>
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted" htmlFor={`sig-${k}`}>{label}</label>
            <input id={`sig-${k}`} placeholder={hint} value={sig[k]} onChange={(e) => setSig({ ...sig, [k]: e.target.value })} className={inputCls} />
          </div>
        ))}
      </div>
      <button type="submit" className="min-h-[44px] rounded-xl bg-ink px-6 font-semibold text-paper transition-transform duration-150 hover:scale-[1.01] active:scale-[0.99]">
        {saved ? "Saved" : "Save signature"}
      </button>
    </form>
  );
}
