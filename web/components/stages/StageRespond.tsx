"use client";
import { useState } from "react";
import { BadgeCheck, Copy, Download, Rocket } from "lucide-react";
import { clsx } from "clsx";
import { apiAuthed, apiPublicPassport } from "@/lib/api";
import { useRequest } from "@/components/RequestWorkspace";
import { StateBadge } from "@/components/StateBadge";

/** Stage 06 — the client response: letter preview, copy/download, DPP preview, publish. */
export function StageRespond() {
  const { data, reload, requestId } = useRequest();
  const { dossier, request } = data;
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const [dpp, setDpp] = useState<any>(null);
  const [dppTried, setDppTried] = useState(false);

  const required = dossier.fields.filter((f: any) => f.required);
  const outstanding = required.filter((f: any) => f.state !== "verified");
  const ready = outstanding.length === 0;

  const current = (f: any) =>
    f.values.find((v: any) => v.status === "accepted" || v.status === "corrected");

  function letterText() {
    const L = [
      `In reply to: ${request.subject}`,
      `For: ${request.requester_name}${request.requester_org ? `, ${request.requester_org}` : ""}`,
      `Product: ${dossier.product.name} (${dossier.product.sku})`,
      "",
      ...required.flatMap((f: any) => {
        const v = current(f);
        const doc = v?.document_id ? dossier.documents.find((d: any) => d.id === v.document_id) : null;
        return [
          `${f.label}: ${v ? `${v.value}${v.unit ? ` ${v.unit}` : ""}` : "Not provided"}`,
          `  Source: ${doc ? `${doc.filename} / ${v.location ?? "?"}` : "—"} · ${f.state}`,
        ];
      }),
      "",
      outstanding.length === 0
        ? "No outstanding items."
        : `Outstanding items (${outstanding.length}): ${outstanding.map((f: any) => f.label).join("; ")}`,
    ];
    return L.join("\n");
  }

  async function copy() {
    await navigator.clipboard.writeText(letterText());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function download() {
    const blob = new Blob([letterText()], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `response-${dossier.product.sku}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function publish() {
    setError(""); setNotice("");
    try {
      await apiAuthed(`/api/products/${dossier.product.id}/publish`, { method: "POST" });
      setNotice("Passport published — the public page is live.");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publish failed");
    }
  }

  async function loadDpp() {
    setDppTried(true);
    try {
      setDpp(await apiPublicPassport(dossier.product.public_slug));
    } catch {
      setDpp(null);
    }
  }

  return (
    <div className="space-y-4">
      <section className="animate-rise overflow-hidden rounded-xl2 border border-line bg-white/70 shadow-card">
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-6 py-4">
          <h2 className="font-display text-lg font-semibold">
            Client response — {ready ? "ready" : "draft, incomplete"}
          </h2>
          <span className="ml-auto font-display text-2xl font-semibold tabular-nums">
            {dossier.readiness_percent}<span className="text-sm">%</span>
          </span>
        </div>
        <div className="px-6 py-4 text-sm">
          <p><strong>For:</strong> {request.requester_name}{request.requester_org ? `, ${request.requester_org}` : ""}</p>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[0.12em] text-muted">Answers with sources</p>
          <table className="mt-2 w-full text-left">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-[0.1em] text-muted">
                <th className="py-2 pr-3 font-semibold">Field</th>
                <th className="py-2 pr-3 font-semibold">Answer</th>
                <th className="py-2 pr-3 font-semibold">Source / location</th>
                <th className="py-2 font-semibold">Verification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dashed divide-line">
              {required.map((f: any) => {
                const v = current(f);
                const doc = v?.document_id ? dossier.documents.find((d: any) => d.id === v.document_id) : null;
                return (
                  <tr key={f.field_key}>
                    <td className="py-2 pr-3 font-medium">{f.label}</td>
                    <td className="py-2 pr-3">{v ? <>{v.value}{v.unit ? <span className="text-muted"> {v.unit}</span> : null}</> : <em className="text-muted">Not provided</em>}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{doc ? `${doc.filename} / ${v.location ?? "?"}` : "—"}</td>
                    <td className="py-2"><StateBadge state={f.state} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {outstanding.length > 0 && (
            <p className="mt-3 rounded-xl bg-amber-wash p-3 text-[13px] font-medium text-amber">
              {outstanding.length} items still without accepted evidence — this draft is not ready to send.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2 border-t border-line px-6 py-4">
          <button onClick={() => void copy()}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-ink px-4 text-sm font-semibold text-paper transition-transform hover:scale-[1.01]">
            <Copy size={15} /> {copied ? "Copied" : "Copy response"}
          </button>
          <button onClick={download}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-line px-4 text-sm font-semibold transition-colors hover:border-ink">
            <Download size={15} /> Download .txt
          </button>
          <span className="ml-auto self-center font-mono text-[11px] text-muted">Local preview — not sent</span>
        </div>
      </section>

      <section className="animate-rise rounded-xl2 border border-line bg-white/70 p-6 shadow-card" style={{ animationDelay: "0.05s" }}>
        <h2 className="font-display text-lg font-semibold">DPP preview</h2>
        {!dppTried ? (
          <button onClick={() => void loadDpp()}
            className="mt-3 inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-line px-4 text-sm font-semibold transition-colors hover:border-ink">
            <BadgeCheck size={15} /> Load public passport preview
          </button>
        ) : dpp ? (
          <dl className="mt-3 divide-y divide-dashed divide-line border-t border-dashed border-line">
            {dpp.fields.map((f: any) => (
              <div key={f.label} className="flex items-baseline gap-4 py-2 text-sm">
                <dt className="w-48 shrink-0 text-xs font-semibold uppercase tracking-[0.1em] text-muted">{f.label}</dt>
                <dd className="font-display text-[17px]">{f.value}{f.unit ? <span className="text-muted"> {f.unit}</span> : null}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-3 text-sm text-inksoft">Not published yet — publish first, then the public page renders here.</p>
        )}
        <div className="ledger-rule my-4" />
        {!dossier.product.passport_published ? (
          <button onClick={() => void publish()}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-ink px-6 font-semibold text-paper transition-transform duration-150 hover:scale-[1.01] active:scale-[0.99]">
            <Rocket size={16} /> Publish passport
          </button>
        ) : (
          <a href={`/passport/${dossier.product.public_slug}`}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-moss px-6 font-semibold text-white">
            <BadgeCheck size={16} /> Open public passport
          </a>
        )}
        {(error || notice) && (
          <p className={clsx("mt-3 text-sm font-medium", error ? "text-brick" : "text-moss-deep")}>{error || notice}</p>
        )}
      </section>
    </div>
  );
}
