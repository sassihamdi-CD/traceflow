"use client";
import React from "react";
import { useState } from "react";
import { Fingerprint, Copy, Check, AlertCircle } from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

const TEXTS = {
  en: {
    title: "Founder console",
    subtitle: "Generate invite codes for pilot companies",
    companyName: "Company name",
    contactName: "Contact name",
    contactEmail: "Contact email",
    role: "Role",
    maxUses: "Max uses",
    expiresInDays: "Expires in (days)",
    generate: "Generate invite code",
    copy: "Copy",
    copied: "Copied!",
    codeLabel: "Invite code",
    codePlaceholder: "e.g. TF-8SP6JD",
    success: "Invite created successfully",
    error: "Failed to create invite",
    roles: {
      admin: "Admin",
      reviewer: "Reviewer",
      supplier: "Supplier",
      auditor: "Auditor",
    },
  },
  it: {
    title: "Console founder",
    subtitle: "Genera codici d'invito per le aziende pilota",
    companyName: "Nome azienda",
    contactName: "Nome contatto",
    contactEmail: "Email contatto",
    role: "Ruolo",
    maxUses: "Usi massimi",
    expiresInDays: "Scade tra (giorni)",
    generate: "Genera codice invito",
    copy: "Copia",
    copied: "Copiato!",
    codeLabel: "Codice invito",
    codePlaceholder: "es. TF-8SP6JD",
    success: "Invito creato con successo",
    error: "Errore nella creazione dell'invito",
    roles: {
      admin: "Admin",
      reviewer: "Revisore",
      supplier: "Fornitore",
      auditor: "Auditor",
    },
  },
} as const;

export default function FounderPage() {
  const [locale, setLocale] = useState("en");
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [role, setRole] = useState<"admin" | "reviewer" | "supplier" | "auditor">("reviewer");
  const [maxUses, setMaxUses] = useState(5);
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [generatedCode, setGeneratedCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    const cookies = document.cookie.split("; ").reduce((acc, cookie) => {
      const [key, value] = cookie.split("=");
      acc[key] = value;
      return acc;
    }, {} as Record<string, string>);
    setLocale(cookies.tf_locale || "en");
  }, []);

  const texts = TEXTS[locale as "en" | "it"];

  async function generate() {
    if (!companyName.trim()) {
      setError("Company name is required");
      return;
    }
    setError(""); setBusy(true); setGeneratedCode(""); setCopied(false);
    try {
      const res = await fetch("/api/founder/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_name: companyName.trim(),
          contact_name: contactName.trim(),
          contact_email: contactEmail.trim(),
          role,
          max_uses: maxUses,
          expires_in_days: expiresInDays,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || texts.error);
      }
      const data = await res.json();
      setGeneratedCode(data.code);
    } catch (err) {
      setError(err instanceof Error ? err.message : texts.error);
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    if (generatedCode) {
      await navigator.clipboard.writeText(generatedCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  const inputCls =
    "mt-2 min-h-[44px] w-full rounded-lg border border-line bg-paper px-3.5 text-[15px] outline-none transition-shadow duration-150 placeholder:text-muted/70 focus:border-ink focus:ring-2 focus:ring-ink/15";

  return (
    <main className="flex min-h-screen bg-muted/30">
      <div className="w-full max-w-3xl mx-auto px-6 py-12">
        <header className="flex items-center justify-between gap-3 mb-10">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-ink text-paper">
            <Fingerprint size={20} />
          </span>
          <LanguageSwitcher />
        </header>

        <h1 className="font-display text-3xl font-semibold tracking-tight mb-2">{texts.title}</h1>
        <p className="text-inksoft mb-8">{texts.subtitle}</p>

        <div className="rounded-xl2 border border-line bg-white/70 p-8 shadow-card space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{texts.companyName}</label>
              <input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Acme Footwear Srl" className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{texts.contactName}</label>
              <input value={contactName} onChange={e => setContactName(e.target.value)} placeholder="Mario Rossi" className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{texts.contactEmail}</label>
              <input type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="mario@acme.com" className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{texts.role}</label>
              <select value={role} onChange={e => setRole(e.target.value as any)} className={inputCls}>
                {Object.entries(texts.roles).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{texts.maxUses}</label>
              <input type="number" min="1" max="100" value={maxUses} onChange={e => setMaxUses(Number(e.target.value))} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{texts.expiresInDays}</label>
              <input type="number" min="1" max="365" value={expiresInDays} onChange={e => setExpiresInDays(Number(e.target.value))} className={inputCls} />
            </div>
          </div>

          <button onClick={generate} disabled={busy} className="min-h-[44px] w-full rounded-xl bg-ink font-semibold text-paper transition-transform duration-150 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50">
            {busy ? "Generating…" : texts.generate}
          </button>

          {error && <p className="text-sm font-medium text-brick flex items-center gap-2"><AlertCircle size={16} />{error}</p>}

          {generatedCode && (
            <div className="border-t border-line pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">{texts.codeLabel}</span>
              </div>
              <div className="flex gap-3">
                <input readOnly value={generatedCode} className="flex-1 min-h-[44px] rounded-lg border border-line bg-parchment px-3.5 text-[15px] font-mono" />
                <button onClick={copyCode} className="min-h-[44px] px-4 rounded-xl bg-parchment font-semibold text-ink transition-colors hover:bg-line/50 flex items-center gap-2">
                  {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
                  {copied ? texts.copied : texts.copy}
                </button>
              </div>
              <p className="text-xs text-muted">
                Share this code with the company. They use it on the <a href="/login" className="underline hover:text-ink">sign-up page</a>.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
