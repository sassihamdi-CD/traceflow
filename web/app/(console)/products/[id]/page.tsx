"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, Copy, ExternalLink, FileText, Pencil, Rocket, Send, X } from "lucide-react";
import { clsx } from "clsx";
import { apiAuthed, supabaseBrowser } from "@/lib/api";
import { FIELD_DESCRIPTIONS, draftSupplierEmail, formatSignature, loadSignature } from "@/lib/fieldMeta";
import { EmailDraftModal } from "@/components/EmailDraftModal";
import { DocumentItems } from "@/components/DocumentItems";
import { StateBadge } from "@/components/StateBadge";
import { ReadinessRing } from "@/components/ReadinessRing";
import { UploadDropzone } from "@/components/UploadDropzone";

type Value = { id: string; field_key: string; value: string; unit: string | null; status: string; document_id: string | null; location: string | null };
type Field = { field_key: string; label: string; required: boolean; state: string; has_new_proposal: boolean; values: Value[] };

const COUNT_STYLE = [
  ["verified", "bg-moss"],
  ["proposed", "bg-amber"],
  ["missing", "bg-muted/60"],
  ["conflicting", "bg-brick"],
] as const;

function ActionButton({ onClick, icon: Icon, label, tone }: { onClick: () => void; icon: typeof Check; label: string; tone: string }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-3 text-[13px] font-semibold transition-all duration-150 hover:scale-[1.02] active:scale-[0.97]",
        tone,
      )}
    >
      <Icon size={14} strokeWidth={2.5} /> {label}
    </button>
  );
}

export default function ProductDetail({ params }: { params: { id: string } }) {
  const [detail, setDetail] = useState<any>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameForm, setRenameForm] = useState({ name: "", sku: "", manufacturer_name: "" });
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [askSupplier, setAskSupplier] = useState<Record<string, string>>({});
  const [mailDraft, setMailDraft] = useState<{ subject: string; body: string; hasSignature: boolean } | null>(null);
  const [lastDraft, setLastDraft] = useState<{ label: string; fieldKey: string; recipient: string; state: string } | null>(null);
  const [newSupplier, setNewSupplier] = useState("");

  async function quickAddSupplier(): Promise<string | null> {
    const name = newSupplier.trim();
    if (!name) {
      setError("Type the supplier name first (e.g. Gommus).");
      return null;
    }
    setError("");
    try {
      const created = await apiAuthed("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const fresh = await apiAuthed("/api/suppliers");
      setSuppliers(fresh);
      setNewSupplier("");
      setNotice(`“${name}” added as supplier.`);
      return created.id as string;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Add failed");
      return null;
    }
  }

  const load = useCallback(async () => {
    try {
      setDetail(await apiAuthed(`/api/products/${params.id}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    }
  }, [params.id]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    apiAuthed("/api/suppliers").then(setSuppliers).catch(() => {});
  }, []);

  // Auto-refresh while any document is still extracting — the reviewer never
  // polls manually. Stops the moment every document reports done/failed.
  useEffect(() => {
    const pending = (detail?.documents ?? []).some((d: any) => d.extraction_status === "pending" || d.extraction_status === "extracting");
    if (!pending) return;
    const t = setInterval(() => { void load(); }, 4000);
    return () => clearInterval(t);
  }, [detail, load]);

  async function act(path: string, body?: unknown, okMsg?: string) {
    setError(""); setNotice("");
    try {
      await apiAuthed(path, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      if (okMsg) setNotice(okMsg);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    }
  }

  async function uploadFiles(files: File[]) {
    setUploading(true); setError(""); setNotice("");
    try {
      const { data } = await supabaseBrowser().auth.getSession();
      let ok = 0, fail = 0;
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        try {
          const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/products/${params.id}/documents`, {
            method: "POST",
            headers: { Authorization: `Bearer ${data.session?.access_token}` },
            body: fd,
          });
          if (!res.ok) fail += 1;
          else ok += 1;
        } catch (err) {
          fail += 1;
          setError(err instanceof Error ? `Network error: ${err.message}` : "Network error during upload");
        }
      }
      if (fail > 0) setError(`${fail} upload(s) failed; ${ok} stored.`);
      else setNotice(`${ok} document(s) stored — extraction running; this page refreshes itself.`);
      await load();
    } finally {
      setUploading(false);
    }
  }

  // The system picks the supplier itself: whoever backs this dossier's documents.
  // Exactly one linked supplier → used silently. Otherwise the reviewer picks.
  function dossierSupplierIds(): string[] {
    const ids = new Set<string>();
    for (const d of detail?.documents ?? []) {
      if (d.supplier_id) ids.add(d.supplier_id);
    }
    return Array.from(ids);
  }

  function supplierForField(fieldKey: string): string | undefined {
    if (askSupplier[fieldKey]) return askSupplier[fieldKey];
    const linked = dossierSupplierIds();
    if (linked.length === 1) return linked[0];
    return undefined;
  }

  async function requestFromSupplier(fieldKey: string, label: string) {
    const supplierId = supplierForField(fieldKey);
    if (!supplierId) {
      setError(`No supplier to ask yet — add one below, then press Request.`);
      return;
    }
    setError(""); setNotice("");
    try {
      const sup = suppliers.find((s) => s.id === supplierId);
      await apiAuthed(`/api/suppliers/${supplierId}/followups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: params.id, field_key: fieldKey }),
      });
      setLastDraft({
        label,
        fieldKey,
        recipient: sup?.name ?? "Supplier",
        state: fields.find((f: Field) => f.field_key === fieldKey)?.state ?? "missing",
      });
      setNotice(`Request on “${label}” saved to follow-ups. Copy the email below and send it yourself.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    }
  }

  function openGapEmail(fieldKey: string, label: string, state: string) {
    const supplierId = supplierForField(fieldKey);
    const sup = suppliers.find((s) => s.id === supplierId);
    const meta = FIELD_DESCRIPTIONS[fieldKey];
    const note =
      state === "conflicting"
        ? "Our sources disagree — please confirm the authoritative value and its source."
        : `Nothing in our documents covers this yet — usually proven by: ${meta?.proof ?? "a supplier document"}.`;
    const sig = loadSignature();
    const { subject, body } = draftSupplierEmail({
      supplierName: sup?.name ?? "Supplier",
      productName: detail.product.name,
      productSku: detail.product.sku,
      gaps: [{ field_key: fieldKey, label, note }],
      signature: sig,
    });
    setMailDraft({ subject, body, hasSignature: formatSignature(sig).length > 0 });
  }

  async function acceptAll() {
    setError(""); setNotice("");
    try {
      const out = await apiAuthed(`/api/products/${params.id}/accept-all`, { method: "POST" });
      const skipped = out.skipped_conflicts > 0 ? ` ${out.skipped_conflicts} conflicting value(s) still need an explicit choice.` : "";
      setNotice(`Accepted ${out.accepted.length} proposal(s).${skipped}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Accept-all failed");
    }
  }

  if (!detail) {
    return (
      <>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl2 bg-parchment" />
          ))}
        </div>
        {error && <p className="mt-4 text-sm font-medium text-brick">{error}</p>}
      </>
    );
  }

  const { product, fields, counts } = detail;
  const published = product.passport_published;
  const unambiguous = fields.flatMap((f: Field) =>
    f.state === "proposed" ? f.values.filter((v) => v.status === "proposed") : [],
  );

  async function saveRename() {
    setError(""); setNotice("");
    const body = Object.fromEntries(Object.entries(renameForm).filter(([, v]) => v.trim()));
    if (Object.keys(body).length === 0) { setRenaming(false); return; }
    try {
      await apiAuthed(`/api/products/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setNotice("Dossier renamed — evidence and history untouched.");
      setRenaming(false);
      setRenameForm({ name: "", sku: "", manufacturer_name: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rename failed");
    }
  }

  return (
    <>
      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">{product.sku} · {product.category}</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">{product.name}</h1>
            <button onClick={() => setRenaming((v) => !v)}
              className="mt-1 inline-flex min-h-[32px] items-center gap-1 rounded-lg px-2 text-xs font-semibold text-muted transition-colors hover:bg-parchment hover:text-ink">
              <Pencil size={13} /> Rename
            </button>
          </div>
          <p className="mt-1 text-sm text-inksoft">{product.manufacturer_name}</p>
          {renaming && (
            <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl border border-line bg-white/70 p-3">
              {[["name", "Product name"], ["sku", "SKU"], ["manufacturer_name", "Manufacturer"]].map(([k, label]) => (
                <label key={k} className="text-xs font-semibold text-muted">
                  {label}
                  <input value={(renameForm as any)[k]}
                    onChange={(e) => setRenameForm({ ...renameForm, [k]: e.target.value })}
                    placeholder={(product as any)[k]}
                    className="mt-1 block min-h-[36px] w-44 rounded-lg border border-line bg-paper px-2.5 text-sm font-normal text-ink outline-none focus:border-ink" />
                </label>
              ))}
              <button onClick={() => void saveRename()}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-ink px-4 text-[13px] font-semibold text-paper">
                <Check size={14} strokeWidth={2.5} /> Save
              </button>
            </div>
          )}
          {unambiguous.length > 0 && (
            <button onClick={() => void acceptAll()}
              className="mt-3 inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-moss px-5 text-sm font-semibold text-white transition-transform duration-150 hover:scale-[1.01] active:scale-[0.99]">
              <Check size={16} strokeWidth={2.5} /> Accept all {unambiguous.length} proposal{unambiguous.length > 1 ? "s" : ""}
            </button>
          )}

          {(error || notice) && (
            <div className={clsx("mt-4 rounded-xl border p-3.5 text-sm font-medium", error ? "border-brick/30 bg-brick-wash text-brick" : "border-moss/30 bg-moss-wash text-moss-deep")}>
              {error || notice}
            </div>
          )}

          <div className="mt-6 space-y-3">
            {fields.map((f: Field, fi: number) => (
              <section
                key={f.field_key}
                style={{ animationDelay: `${Math.min(fi, 8) * 0.05}s` }}
                className="animate-rise rounded-xl2 border border-line bg-white/70 p-5 shadow-card"
              >
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="font-display text-lg font-semibold">{f.label}</h2>
                  <StateBadge state={f.state} pulse={f.state === "conflicting"} />
                  {f.has_new_proposal && (
                    <span className="rounded-full bg-amber-wash px-2.5 py-1 text-xs font-semibold text-amber">new evidence to review</span>
                  )}
                  <span className="ml-auto font-mono text-xs text-muted">{f.field_key}</span>
                </div>
                {FIELD_DESCRIPTIONS[f.field_key] && (
                  <p className="mt-1.5 text-[13px] leading-relaxed text-inksoft">
                    {FIELD_DESCRIPTIONS[f.field_key].what}{" "}
                    <span className="text-muted">Usually proven by: {FIELD_DESCRIPTIONS[f.field_key].proof}</span>
                  </p>
                )}
                {f.required && (f.state === "missing" || f.state === "conflicting") && (() => {
                  const autoId = supplierForField(f.field_key);
                  const autoSup = suppliers.find((s) => s.id === autoId);
                  const linkedCount = dossierSupplierIds().length;
                  return (
                  <div className="mt-2.5 rounded-xl border border-amber/30 bg-amber-wash/50 p-3">
                    <p className="text-[13px] font-medium text-amber">
                      {f.state === "missing"
                        ? "No document covers this yet — ask the supplier directly, no navigation needed."
                        : "Sources disagree — ask the supplier for the authoritative value."}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {suppliers.length === 0 ? (
                        <span className="inline-flex min-h-[36px] flex-1 items-center gap-2">
                          <input value={newSupplier}
                            onChange={(e) => setNewSupplier(e.target.value)}
                            placeholder="Supplier name, e.g. Gommus…"
                            className="min-h-[36px] w-52 rounded-lg border border-line bg-paper px-2.5 text-[13px] outline-none focus:border-ink" />
                          <button onClick={() => void (async () => {
                            const id = await quickAddSupplier();
                            if (id) setAskSupplier({ ...askSupplier, [f.field_key]: id });
                          })()}
                            className="inline-flex min-h-[36px] items-center rounded-lg bg-ink px-3 text-[13px] font-semibold text-paper">
                            Add supplier
                          </button>
                        </span>
                      ) : autoSup ? (
                        <span className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-paper px-3 text-[13px] font-semibold">
                          To: {autoSup.name}
                          {linkedCount === 1 && <span className="font-mono text-[11px] font-normal text-muted">· auto, from your documents</span>}
                        </span>
                      ) : (
                        <select value={askSupplier[f.field_key] ?? ""}
                          onChange={(e) => setAskSupplier({ ...askSupplier, [f.field_key]: e.target.value })}
                          className="min-h-[36px] rounded-lg border border-line bg-paper px-2 text-[13px] outline-none focus:border-ink">
                          <option value="">Select supplier…</option>
                          {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      )}
                      {autoSup && linkedCount > 1 && (
                        <select value={askSupplier[f.field_key] ?? ""}
                          onChange={(e) => setAskSupplier({ ...askSupplier, [f.field_key]: e.target.value })}
                          className="min-h-[36px] rounded-lg border border-line bg-paper px-2 text-[13px] outline-none focus:border-ink">
                          <option value="">Change…</option>
                          {suppliers.filter((s) => s.id !== autoSup.id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      )}
                      <button onClick={() => void requestFromSupplier(f.field_key, f.label)}
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-ink px-3 text-[13px] font-semibold text-paper transition-all hover:scale-[1.02] active:scale-[0.97]">
                        <Send size={13} /> Request
                      </button>
                      <button onClick={() => openGapEmail(f.field_key, f.label, f.state)}
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-line bg-paper px-3 text-[13px] font-semibold transition-all hover:scale-[1.02] hover:border-ink active:scale-[0.97]">
                        <Copy size={13} /> Write email
                      </button>
                    </div>
                    {lastDraft?.fieldKey === f.field_key && (
                      <div className="mt-2 rounded-lg border border-moss/30 bg-moss-wash p-3 text-[13px]">
                        <p className="font-semibold text-moss-deep">Saved — follow-up for “{lastDraft.label}” is with {lastDraft.recipient}.</p>
                        <p className="mt-0.5 text-moss-deep/80">It waits in Identify Gaps → follow-ups. <button className="font-semibold underline" onClick={() => openGapEmail(f.field_key, f.label, lastDraft.state)}>Write the email now</button>, paste into your mailbox, send.</p>
                      </div>
                    )}
                  </div>
                  );
                })()}

                {f.values.length === 0 && <p className="mt-3 text-sm italic text-muted">No values yet — upload a source document.</p>}

                <div className="mt-2 divide-y divide-dashed divide-line">
                  {f.values.map((v) => (
                    <div key={v.id} className="py-3">
                      <p className="text-[15px] font-medium leading-relaxed">
                        {v.value}{v.unit ? <span className="text-muted"> {v.unit}</span> : null}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs text-muted">
                        <span className={clsx("font-semibold", v.status === "accepted" || v.status === "corrected" ? "text-moss-deep" : v.status === "rejected" ? "text-muted line-through" : "text-amber")}>
                          {v.status.toUpperCase()}
                        </span>
                        {v.location && <span className="inline-flex items-center gap-1"><FileText size={12} />{v.location}</span>}
                      </p>
                      {v.status === "proposed" && (
                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                          <ActionButton onClick={() => void act(`/api/fields/${v.id}/accept`, undefined, `Accepted “${f.label}”.`)} icon={Check} label="Accept" tone="border-moss/40 bg-moss-wash text-moss-deep hover:bg-moss hover:text-white" />
                          <ActionButton onClick={() => void act(`/api/fields/${v.id}/reject`, undefined, `Rejected a proposal for “${f.label}”.`)} icon={X} label="Reject" tone="border-line bg-paper text-inksoft hover:border-brick hover:text-brick" />
                          {f.state === "conflicting" && (
                            <ActionButton
                              onClick={() => void act(`/api/products/${params.id}/fields/${f.field_key}/resolve-conflict`, { chosen_field_value_id: v.id }, `Conflict on “${f.label}” resolved.`)}
                              icon={Check} label="Resolve conflict with this" tone="border-brick/40 bg-brick-wash text-brick hover:bg-brick hover:text-white"
                            />
                          )}
                          <span className="inline-flex min-h-[36px] items-center gap-2">
                            <input
                              placeholder="Corrected value…"
                              value={edit[v.id] ?? ""}
                              onChange={(e) => setEdit({ ...edit, [v.id]: e.target.value })}
                              className="min-h-[36px] w-44 rounded-lg border border-line bg-paper px-2.5 text-sm outline-none transition-shadow duration-150 focus:border-ink focus:ring-2 focus:ring-ink/15"
                            />
                            <ActionButton
                              onClick={() => edit[v.id]?.trim() ? void act(`/api/fields/${v.id}/correct`, { value: edit[v.id].trim() }, `Corrected “${f.label}”.`) : setError("Type the corrected value first.")}
                              icon={Pencil} label="Edit & accept" tone="border-ink/30 bg-ink text-paper hover:bg-ink/85"
                            />
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>

          {(detail.documents ?? []).length > 0 && (
            <div className="mt-6 rounded-xl2 border border-line bg-white/70 p-5 shadow-card">
              <h2 className="font-display text-lg font-semibold">Source documents</h2>
              <p className="mt-1 text-[13px] text-muted">Every labeled value transcribed from each document — full extraction, separate from the passport fields above.</p>
              <div className="mt-3 space-y-2">
                {(detail.documents ?? []).map((d: any) => (
                  <details key={d.id} className="rounded-xl border border-line bg-paper px-4 py-2.5">
                    <summary className="cursor-pointer text-sm font-semibold">
                      {d.filename}
                      <span className="ml-2 font-mono text-xs font-normal text-muted">
                        {d.extraction_status}{typeof d.extracted_count === "number" ? ` · ${d.extracted_count} passport value(s)` : ""}
                      </span>
                      <span className="ml-2 text-xs font-normal text-muted">— All extracted values</span>
                    </summary>
                    <DocumentItems documentId={d.id} />
                  </details>
                ))}
              </div>
            </div>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-xl2 border border-line bg-white/70 p-5 shadow-card">
            <div className="flex justify-center"><ReadinessRing percent={detail.readiness_percent} /></div>
            <div className="ledger-rule my-4" />
            <dl className="space-y-2 text-sm">
              {COUNT_STYLE.map(([k, dot]) => (
                <div key={k} className="flex items-center gap-2.5">
                  <span className={clsx("h-2.5 w-2.5 rounded-full", dot)} />
                  <dt className="capitalize text-inksoft">{k}</dt>
                  <dd className="ml-auto font-semibold tabular-nums">{counts[k] ?? 0}</dd>
                </div>
              ))}
              <div className="flex items-center gap-2.5 border-t border-line pt-2">
                <dt className="font-semibold">Actions required</dt>
                <dd className="ml-auto font-display text-xl font-semibold tabular-nums">{detail.actions_required}</dd>
              </div>
            </dl>
          </div>

          <div className="mt-4">
            <UploadDropzone onFiles={(fs) => void uploadFiles(fs)} busy={uploading} />
          </div>

          <div className="mt-4 rounded-xl2 border border-line bg-white/70 p-5 shadow-card">
            {published ? (
              <a href={`/passport/${product.public_slug}`} className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-moss font-semibold text-white transition-transform duration-150 hover:scale-[1.01] active:scale-[0.99]">
                View public passport <ExternalLink size={16} />
              </a>
            ) : (
              <button
                onClick={() => void act(`/api/products/${params.id}/publish`, undefined, "Passport published.")}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-ink font-semibold text-paper transition-transform duration-150 hover:scale-[1.01] active:scale-[0.99]"
              >
                <Rocket size={16} /> Publish passport
              </button>
            )}
            <p className="mt-2.5 text-xs leading-relaxed text-muted">Publishing requires all {detail.total_required} required fields verified. Unverified fields block it with a named list — never silently.</p>
          </div>
        </aside>
      </div>
      {mailDraft && (
        <EmailDraftModal
          initialSubject={mailDraft.subject}
          initialBody={mailDraft.body}
          hasSignature={mailDraft.hasSignature}
          onClose={() => setMailDraft(null)}
        />
      )}
    </>
  );
}
