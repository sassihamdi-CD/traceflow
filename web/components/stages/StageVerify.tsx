"use client";
import { useEffect, useState } from "react";
import { Check, MessageCircleQuestion, Pencil, X } from "lucide-react";
import { clsx } from "clsx";
import { apiAuthed } from "@/lib/api";
import { useRequest } from "@/components/RequestWorkspace";
import { StateBadge } from "@/components/StateBadge";

/** Stage 04 — a person decides. Accept / Reject / Edit / Request clarification. */
export function StageVerify() {
  const { data, reload } = useRequest();
  const { dossier } = data;
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [clarifyFor, setClarifyFor] = useState<Record<string, string>>({});
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    apiAuthed("/api/suppliers").then(setSuppliers).catch(() => {});
  }, []);

  async function act(path: string, body?: unknown, okMsg?: string) {
    setError(""); setNotice("");
    try {
      await apiAuthed(path, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      if (okMsg) setNotice(okMsg);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  }

  async function requestClarification(fieldKey: string, label: string) {
    const supplierId = clarifyFor[fieldKey];
    if (!supplierId) {
      setError(`Pick the supplier to ask about “${label}” first.`);
      return;
    }
    await act(
      `/api/suppliers/${supplierId}/followups`,
      { product_id: dossier.product.id, field_key: fieldKey },
      `Clarification on “${label}” drafted — see Identify Gaps to send it.`,
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-inksoft">
        Reviewing as the product-data owner. Nothing reaches the client because a model produced it —
        accepted answers keep the evidence they were accepted on.
      </p>
      {(error || notice) && (
        <div className={clsx("rounded-xl border p-3.5 text-sm font-medium", error ? "border-brick/30 bg-brick-wash text-brick" : "border-moss/30 bg-moss-wash text-moss-deep")}>
          {error || notice}
        </div>
      )}
      {dossier.fields.filter((f: any) => f.required).map((f: any, i: number) => {
        const cands = f.values.filter((v: any) => v.status === "proposed");
        return (
          <section key={f.field_key} style={{ animationDelay: `${Math.min(i, 8) * 0.04}s` }}
            className="animate-rise rounded-xl2 border border-line bg-white/70 p-5 shadow-card">
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="font-display text-lg font-semibold">{f.label}</h3>
              <StateBadge state={f.state} pulse={f.state === "conflicting"} />
            </div>
            {cands.length === 0 && (
              <p className="mt-2 text-sm italic text-muted">
                {f.state === "verified" ? "Verified — no open proposals." : "No proposals — nothing to decide yet."}
              </p>
            )}
            {cands.map((v: any) => (
              <div key={v.id} className="mt-2 border-t border-dashed border-line pt-3">
                <p className="text-[15px] font-medium">{v.value}{v.unit ? <span className="text-muted"> {v.unit}</span> : null}</p>
                <p className="mt-0.5 font-mono text-xs text-muted">{v.location ?? "no location recorded"}</p>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <button onClick={() => void act(`/api/fields/${v.id}/accept`, undefined, `Accepted “${f.label}”.`)}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-moss/40 bg-moss-wash px-3 text-[13px] font-semibold text-moss-deep transition-all hover:scale-[1.02] hover:bg-moss hover:text-white active:scale-[0.97]">
                    <Check size={14} strokeWidth={2.5} /> Accept
                  </button>
                  <button onClick={() => void act(`/api/fields/${v.id}/reject`, undefined, `Rejected a proposal for “${f.label}”.`)}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-line bg-paper px-3 text-[13px] font-semibold text-inksoft transition-all hover:scale-[1.02] hover:border-brick hover:text-brick active:scale-[0.97]">
                    <X size={14} strokeWidth={2.5} /> Reject
                  </button>
                  <span className="inline-flex min-h-[36px] items-center gap-2">
                    <input placeholder="Corrected value…" value={edit[v.id] ?? ""}
                      onChange={(e) => setEdit({ ...edit, [v.id]: e.target.value })}
                      className="min-h-[36px] w-40 rounded-lg border border-line bg-paper px-2.5 text-sm outline-none focus:border-ink focus:ring-2 focus:ring-ink/15" />
                    <button onClick={() => edit[v.id]?.trim() ? void act(`/api/fields/${v.id}/correct`, { value: edit[v.id].trim() }, `Corrected “${f.label}”.`) : setError("Type the corrected value first.")}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-ink px-3 text-[13px] font-semibold text-paper transition-all hover:scale-[1.02] active:scale-[0.97]">
                      <Pencil size={13} /> Edit
                    </button>
                  </span>
                  {f.state === "conflicting" && (
                    <button onClick={() => void act(`/api/products/${dossier.product.id}/fields/${f.field_key}/resolve-conflict`, { chosen_field_value_id: v.id }, `Conflict on “${f.label}” resolved.`)}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-brick/40 bg-brick-wash px-3 text-[13px] font-semibold text-brick transition-all hover:scale-[1.02] hover:bg-brick hover:text-white active:scale-[0.97]">
                      <Check size={14} strokeWidth={2.5} /> Resolve conflict with this
                    </button>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select value={clarifyFor[f.field_key] ?? ""} onChange={(e) => setClarifyFor({ ...clarifyFor, [f.field_key]: e.target.value })}
                    className="min-h-[36px] rounded-lg border border-line bg-paper px-2 text-[13px] outline-none focus:border-ink">
                    <option value="">Ask supplier…</option>
                    {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <button onClick={() => void requestClarification(f.field_key, f.label)}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-amber/40 bg-amber-wash px-3 text-[13px] font-semibold text-amber transition-all hover:scale-[1.02] active:scale-[0.97]">
                    <MessageCircleQuestion size={14} /> Request clarification
                  </button>
                </div>
                <p className="mt-1.5 text-xs text-muted">An edited value still needs a source before it can be accepted.</p>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
