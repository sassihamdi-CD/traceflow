"use client";
import { useEffect, useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { clsx } from "clsx";
import { apiAuthed } from "@/lib/api";
import { useRequest } from "@/components/RequestWorkspace";

/** Stage 05 — gaps are part of the answer. Draft a targeted supplier follow-up (never sent). */
const GAP_DEFS = [
  { key: "missing", title: "Missing evidence", text: "No document in the pack covers this field." },
  { key: "out_of_date", title: "Out of date", text: "A document exists, but its own validity has lapsed." },
  { key: "conflicting", title: "Sources disagree", text: "Two documents give different values for the same field." },
  { key: "rejected_unreplaced", title: "Rejected by reviewer", text: "A proposal was turned down and has not been replaced." },
] as const;

export function StageGaps() {
  const { data, reload } = useRequest();
  const { dossier, gaps, followups, request } = data;
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [subject, setSubject] = useState(`Missing product information — ${dossier.product.sku}`);
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    apiAuthed("/api/suppliers").then(setSuppliers).catch(() => {});
  }, []);

  const openFields = useMemo(() => {
    const keys = new Set([...gaps.missing, ...gaps.conflicting, ...gaps.proposed]);
    return dossier.fields.filter((f: any) => f.required && keys.has(f.field_key));
  }, [dossier, gaps]);

  const labels: Record<string, string> = Object.fromEntries(
    dossier.fields.map((f: any) => [f.field_key, f.label]),
  );

  function toggle(k: string) {
    setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  }

  async function saveDraft() {
    setError(""); setNotice(""); setCopied(false);
    if (!supplierId) { setError("Choose the supplier to ask."); return; }
    if (picked.length === 0) { setError("Add at least one open item."); return; }
    const sup = suppliers.find((s) => s.id === supplierId);
    try {
      await apiAuthed(`/api/suppliers/${supplierId}/followups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: dossier.product.id,
          field_key: picked[0],
          recipient: sup ? `${sup.name}${sup.external_code ? ` — ${sup.external_code}` : ""}` : "",
          subject,
          items: picked,
        }),
      });
      setNotice("Follow-up drafted. Copy it out — nothing is sent by this app.");
      setPicked([]);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function copyDraft(f: any) {
    const lines = [
      `To: ${f.recipient || "(supplier)"}`,
      `Subject: ${f.subject || "(subject)"}`,
      "",
      ...(f.items || [f.field_key]).map((k: string) => `• ${(labels[k] || k)} — evidence needed`),
      "",
      `Re: ${request.subject} (${dossier.product.sku})`,
    ].join("\n");
    await navigator.clipboard.writeText(lines);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-4">
      <section className="animate-rise rounded-xl2 border border-line bg-white/70 p-6 shadow-card">
        <h2 className="font-display text-lg font-semibold">Response readiness</h2>
        <p className="mt-1 font-display text-4xl font-semibold tabular-nums">
          {dossier.readiness_percent}<span className="text-xl">%</span>
          <span className="ml-2 align-middle font-sans text-sm font-normal text-muted">
            {dossier.counts.verified}/{dossier.total_required} verified
          </span>
        </p>
        <p className="mt-1 max-w-xl text-[13px] text-inksoft">
          Verified required fields ÷ total required fields. Not a compliance score. Anything not
          accepted stays visible as an outstanding item — never dropped to look finished.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {GAP_DEFS.map((g) => (
            <div key={g.key} className="rounded-xl border border-line bg-paper p-4">
              <p className="font-display text-2xl font-semibold tabular-nums">{gaps[g.key].length}</p>
              <p className="text-sm font-semibold">{g.title}</p>
              <p className="text-[13px] text-inksoft">{g.text}</p>
              {gaps[g.key].length > 0 && (
                <p className="mt-1 font-mono text-xs text-muted">{gaps[g.key].join(", ")}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="animate-rise rounded-xl2 border border-line bg-white/70 p-6 shadow-card" style={{ animationDelay: "0.05s" }}>
        <h2 className="font-display text-lg font-semibold">Supplier follow-up</h2>
        <p className="mt-1 text-[13px] text-inksoft">
          A targeted request to one supplier, for the items only they can answer. Drafted here, copied out by hand — never sent.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">To (supplier)</label>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}
              className="mt-2 min-h-[44px] w-full rounded-lg border border-line bg-paper px-3 text-[15px] outline-none focus:border-ink">
              <option value="">Select supplier…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}{s.external_code ? ` — ${s.external_code}` : ""}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Subject</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)}
              className="mt-2 min-h-[44px] w-full rounded-lg border border-line bg-paper px-3.5 text-[15px] outline-none focus:border-ink focus:ring-2 focus:ring-ink/15" />
          </div>
        </div>
        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-muted">Requested items</p>
        <ul className="mt-2 space-y-2">
          {openFields.map((f: any) => (
            <li key={f.field_key}>
              <button onClick={() => toggle(f.field_key)}
                className={clsx(
                  "flex min-h-[44px] w-full items-center gap-3 rounded-lg border px-3.5 text-left text-sm transition-all",
                  picked.includes(f.field_key)
                    ? "border-ink bg-ink text-paper"
                    : "border-line bg-paper hover:border-ink",
                )}>
                <span className={clsx("flex h-5 w-5 items-center justify-center rounded border",
                  picked.includes(f.field_key) ? "border-paper bg-paper text-ink" : "border-muted/50")}>
                  {picked.includes(f.field_key) && <Check size={13} strokeWidth={3} />}
                </span>
                <span className="font-medium">{f.label}</span>
                <span className={clsx("ml-auto font-mono text-xs", picked.includes(f.field_key) ? "text-paper/70" : "text-muted")}>{f.state}</span>
              </button>
            </li>
          ))}
          {openFields.length === 0 && <li className="text-sm text-inksoft">No open items — nothing to ask for.</li>}
        </ul>
        <button onClick={() => void saveDraft()}
          className="mt-4 inline-flex min-h-[44px] items-center rounded-xl bg-ink px-6 font-semibold text-paper transition-transform duration-150 hover:scale-[1.01] active:scale-[0.99]">
          Save follow-up draft
        </button>
        {(error || notice) && (
          <p className={clsx("mt-3 text-sm font-medium", error ? "text-brick" : "text-moss-deep")}>{error || notice}</p>
        )}

        {followups.length > 0 && (
          <div className="mt-5 border-t border-line pt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Prepared follow-ups</p>
            <ul className="mt-2 space-y-2">
              {followups.map((f: any) => (
                <li key={f.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-parchment/70 px-3.5 py-2.5 text-sm">
                  <span className="font-medium">{f.subject || "(no subject)"}</span>
                  <span className="font-mono text-xs text-muted">{f.status} · {(f.items || []).length} items</span>
                  <button onClick={() => void copyDraft(f)}
                    className="ml-auto inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-line bg-paper px-3 text-[13px] font-semibold transition-all hover:scale-[1.02] hover:border-ink">
                    <Copy size={13} /> {copied ? "Copied" : "Copy"}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
