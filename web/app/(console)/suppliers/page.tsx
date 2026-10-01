"use client";
import { useCallback, useEffect, useState } from "react";
import { Building2, Plus } from "lucide-react";
import { apiAuthed } from "@/lib/api";

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setSuppliers(await apiAuthed("/api/suppliers"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      await apiAuthed("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), external_code: code.trim() || null }),
      });
      setName(""); setCode(""); setShowForm(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">Evidence ledger</p>
      <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">Suppliers</h1>
      <p className="mt-2 max-w-xl text-sm text-inksoft">
        Health = share of a supplier&apos;s evidence values a human has verified. Low health means their documents need chasing — draft a follow-up, sending stays manual in this pilot.
      </p>
      <button onClick={() => setShowForm((v) => !v)}
        className="mt-4 inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-paper transition-transform duration-150 hover:scale-[1.01] active:scale-[0.99]">
        <Plus size={16} /> Add supplier
      </button>
      {showForm && (
        <form onSubmit={create} className="animate-rise mt-3 flex max-w-xl flex-wrap items-end gap-3 rounded-xl2 border border-line bg-white/70 p-4 shadow-card">
          <label className="flex-1 text-xs font-semibold text-muted">Name
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Gommus Soc. Coop."
              className="mt-1 block min-h-[40px] w-full rounded-lg border border-line bg-paper px-3 text-sm font-normal text-ink outline-none focus:border-ink" />
          </label>
          <label className="text-xs font-semibold text-muted">External code
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="L-18"
              className="mt-1 block min-h-[40px] w-32 rounded-lg border border-line bg-paper px-3 text-sm font-normal text-ink outline-none focus:border-ink" />
          </label>
          <button type="submit" disabled={busy} className="min-h-[40px] rounded-lg bg-moss px-5 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "Saving…" : "Save"}
          </button>
        </form>
      )}
      {error && <p className="mt-4 text-sm font-medium text-brick">{error}</p>}
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {suppliers.map((s, i) => (
          <div
            key={s.id}
            style={{ animationDelay: `${Math.min(i, 8) * 0.06}s` }}
            className="animate-rise rounded-xl2 border border-line bg-white/70 p-5 shadow-card"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-parchment text-ink">
                <Building2 size={19} />
              </span>
              <div>
                <h2 className="font-display text-lg font-semibold leading-tight">{s.name}</h2>
                {s.external_code && <p className="font-mono text-xs text-muted">{s.external_code}</p>}
              </div>
              <span className="ml-auto text-right">
                <span className="block font-display text-2xl font-semibold tabular-nums">
                  {s.evidence_health_percent ?? "—"}{s.evidence_health_percent != null && <span className="text-sm">%</span>}
                </span>
                <span className="block text-[11px] uppercase tracking-[0.12em] text-muted">health</span>
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-parchment">
              <div
                className="h-full rounded-full bg-moss transition-[width] duration-700 ease-out"
                style={{ width: `${s.evidence_health_percent ?? 0}%` }}
              />
            </div>
            <p className="mt-3 text-sm text-inksoft">
              Open requests: <strong className="tabular-nums">{s.open_requests}</strong>
            </p>
          </div>
        ))}
      </div>
      {suppliers.length === 0 && !error && (
        <p className="mt-6 rounded-xl2 border border-dashed border-muted/50 bg-parchment/50 p-6 text-sm text-muted">
          No suppliers yet — they appear once uploaded documents are linked to them.
        </p>
      )}
    </>
  );
}
