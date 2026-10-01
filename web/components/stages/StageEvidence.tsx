"use client";
import Link from "next/link";
import { ArrowRight, FileText } from "lucide-react";
import { useRequest } from "@/components/RequestWorkspace";
import { StateBadge } from "@/components/StateBadge";

/** Stage 03 — the evidence map: every field, value, source, location, status. */
export function StageEvidence() {
  const { data, requestId } = useRequest();
  const { dossier } = data;
  const docsById: Record<string, any> = Object.fromEntries(dossier.documents.map((d: any) => [d.id, d]));

  const current = (f: any) =>
    f.values.find((v: any) => v.status === "accepted" || v.status === "corrected")
    ?? f.values.find((v: any) => v.status === "proposed");

  return (
    <div className="space-y-4">
      <section className="animate-rise overflow-hidden rounded-xl2 border border-line bg-white/70 shadow-card">
        <div className="border-b border-line px-6 py-4">
          <h2 className="font-display text-lg font-semibold">
            {dossier.product.name} · {dossier.product.sku} — evidence map
          </h2>
          <p className="text-[13px] text-inksoft">A value with no source is not an answer.</p>
        </div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line bg-parchment/60 text-xs uppercase tracking-[0.1em] text-muted">
              <th className="px-6 py-3 font-semibold">Field</th>
              <th className="px-4 py-3 font-semibold">Value</th>
              <th className="px-4 py-3 font-semibold">Source document</th>
              <th className="px-4 py-3 font-semibold">Page / location</th>
              <th className="px-6 py-3 font-semibold">Review status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {dossier.fields.filter((f: any) => f.required).map((f: any) => {
              const v = current(f);
              const doc = v?.document_id ? docsById[v.document_id] : null;
              return (
                <tr key={f.field_key} className="transition-colors hover:bg-parchment/50">
                  <td className="px-6 py-3 font-medium">{f.label}</td>
                  <td className="px-4 py-3">{v ? <>{v.value}{v.unit ? <span className="text-muted"> {v.unit}</span> : null}</> : <em className="text-muted">Not provided</em>}</td>
                  <td className="px-4 py-3 font-mono text-xs">{doc ? doc.filename : "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{v?.location ?? "—"}</td>
                  <td className="px-6 py-3"><StateBadge state={f.state} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      {dossier.fields.filter((f: any) => f.required && f.state === "missing").map((f: any, i: number) => (
        <section key={f.field_key} className="rounded-xl2 border border-dashed border-muted/50 bg-parchment/50 p-5" style={{ animationDelay: `${i * 0.04}s` }}>
          <h3 className="font-display text-[17px] font-semibold">{f.label}</h3>
          <p className="mt-1 text-sm text-inksoft">
            {f.values.length === 0
              ? "Nothing in the loaded documents covers this field."
              : "Proposals for this field were reviewed and none accepted — see the dossier history."}
          </p>
          <p className="mt-1 font-mono text-xs text-muted">Not yet structured · No source</p>
        </section>
      ))}

      <Link href={`/requests/${requestId}/verify`}
        className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-ink px-5 font-semibold text-paper transition-transform duration-150 hover:scale-[1.01]">
        Review the proposals <ArrowRight size={16} />
      </Link>
      <p className="text-xs text-muted">AI proposes. Humans verify.</p>
    </div>
  );
}
