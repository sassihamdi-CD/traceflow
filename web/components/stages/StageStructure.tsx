"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Building2, FileText, Plus } from "lucide-react";
import { useRequest } from "@/components/RequestWorkspace";
import { UploadDropzone } from "@/components/UploadDropzone";
import { apiAuthed, supabaseBrowser } from "@/lib/api";

/** Stage 02 — load sources, extraction proposes values for review. */
export function StageStructure() {
  const { data, reload, requestId } = useRequest();
  const { dossier } = data;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [uploadSupplier, setUploadSupplier] = useState("");
  const [linking, setLinking] = useState<string | null>(null);

  useEffect(() => {
    apiAuthed("/api/suppliers").then(setSuppliers).catch(() => {});
  }, []);

  async function upload(files: File[]) {
    setBusy(true); setError(""); setNotice("");
    try {
      const { data: s } = await supabaseBrowser().auth.getSession();
      let ok = 0;
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        if (uploadSupplier) fd.append("supplier_id", uploadSupplier);
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/products/${dossier.product.id}/documents`, {
          method: "POST",
          headers: { Authorization: `Bearer ${s.session?.access_token}` },
          body: fd,
        });
        if (res.ok) ok += 1;
      }
      setNotice(`${ok} document(s) stored — structuring runs in the background; values appear below as they land.`);
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function linkDocument(docId: string, supplierId: string) {
    setError("");
    try {
      await apiAuthed(`/api/documents/${docId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplier_id: supplierId || null }),
      });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Link failed");
    }
  }

  async function addPartyAsSupplier(docId: string, name: string) {
    setError(""); setLinking(name);
    try {
      const created = await apiAuthed("/api/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      await apiAuthed(`/api/documents/${docId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplier_id: created.id }),
      });
      const fresh = await apiAuthed("/api/suppliers");
      setSuppliers(fresh);
      setNotice(`“${name}” added as supplier and linked to the document.`);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Add failed");
    } finally {
      setLinking(null);
    }
  }

  const proposed = dossier.fields.flatMap((f: any) =>
    f.values.filter((v: any) => v.status === "proposed").map((v: any) => ({ ...v, label: f.label })),
  );

  const knownNames = new Set(suppliers.map((s: any) => s.name.toLowerCase()));

  return (
    <div className="space-y-4">
      <section className="animate-rise rounded-xl2 border border-line bg-white/70 p-6 shadow-card">
        <h2 className="font-display text-lg font-semibold">Sources</h2>
        <p className="mt-1 text-[13px] text-inksoft">
          {dossier.documents.length === 0
            ? "No documents loaded yet. The information exists across BOMs, declarations, certificates — load them here."
            : `${dossier.documents.length} document${dossier.documents.length > 1 ? "s" : ""} loaded. Every quotation later links back to its source.`}
        </p>
        <ul className="mt-3 space-y-3">
          {dossier.documents.map((d: any) => (
            <li key={d.id} className="rounded-xl border border-line bg-paper/60 p-3">
              <div className="flex items-center gap-2.5 font-mono text-[13px]">
                <FileText size={14} className="shrink-0 text-muted" />
                <span className="truncate">{d.filename}</span>
                {(d.extraction_status === "pending" || d.extraction_status === "extracting") && (
                  <span className="shrink-0 rounded-full bg-amber-wash px-2 py-0.5 text-[11px] font-bold text-amber">extracting…</span>
                )}
                {d.extraction_status === "done" && (
                  <span className="shrink-0 rounded-full bg-moss-wash px-2 py-0.5 text-[11px] font-bold text-moss-deep">
                    {d.extracted_count} value{d.extracted_count === 1 ? "" : "s"}
                  </span>
                )}
                {d.extraction_status === "failed" && (
                  <span className="shrink-0 rounded-full bg-brick-wash px-2 py-0.5 text-[11px] font-bold text-brick" title={d.extraction_error ?? ""}>
                    failed{d.extraction_error ? ` · ${d.extraction_error}` : ""}
                  </span>
                )}
                <span className="ml-auto shrink-0 text-xs text-muted">{new Date(d.uploaded_at).toLocaleDateString()}</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
                <Building2 size={14} className="text-muted" />
                {d.supplier_name ? (
                  <span className="font-semibold">{d.supplier_name}</span>
                ) : (
                  <span className="italic text-muted">No supplier linked</span>
                )}
                <select value={d.supplier_id ?? ""} onChange={(e) => void linkDocument(d.id, e.target.value)}
                  className="min-h-[32px] rounded-lg border border-line bg-paper px-2 text-xs outline-none focus:border-ink">
                  <option value="">Link supplier…</option>
                  {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              {(d.detected_parties ?? []).length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-[11px] text-muted">Named in this document:</span>
                  {d.detected_parties.map((p: any, i: number) => {
                    const known = knownNames.has((p.name || "").toLowerCase());
                    return known ? (
                      <span key={i} className="rounded-full bg-moss-wash px-2.5 py-0.5 text-xs font-semibold text-moss-deep">
                        {p.name} · {p.role}
                      </span>
                    ) : (
                      <button key={i} disabled={linking !== null}
                        onClick={() => void addPartyAsSupplier(d.id, p.name)}
                        title={`Add “${p.name}” as supplier and link this document`}
                        className="rounded-full border border-amber/40 bg-amber-wash px-2.5 py-0.5 text-xs font-semibold text-amber transition-all hover:scale-[1.04] disabled:opacity-50">
                        <Plus size={11} className="mr-0.5 inline" />{p.name} · {p.role}
                      </button>
                    );
                  })}
                </div>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_220px] md:items-end">
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted" htmlFor="up-supplier">
              Attribute uploads to supplier (optional)
            </label>
            <select id="up-supplier" value={uploadSupplier} onChange={(e) => setUploadSupplier(e.target.value)}
              className="mt-2 min-h-[44px] w-full rounded-lg border border-line bg-paper px-3 text-sm outline-none focus:border-ink">
              <option value="">Detect from document…</option>
              {suppliers.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-3"><UploadDropzone onFiles={(fs) => void upload(fs)} busy={busy} /></div>
        {error && <p className="mt-2 text-sm font-medium text-brick">{error}</p>}
        {notice && <p className="mt-2 text-sm font-medium text-moss-deep">{notice}</p>}
      </section>

      <section className="animate-rise rounded-xl2 border border-line bg-white/70 p-6 shadow-card" style={{ animationDelay: "0.05s" }}>
        <h2 className="font-display text-lg font-semibold">Structure into the requested fields</h2>
        <p className="mt-1 text-[13px] text-inksoft">
          Real extraction: Claude reads each document against the requested fields and proposes values with
          locations. Nothing is decided here — every value arrives as a proposal.
        </p>
        {proposed.length === 0 ? (
          <p className="mt-3 rounded-xl bg-parchment/70 p-4 text-sm text-inksoft">
            No proposals waiting. Load a document above to start structuring.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-dashed divide-line border-t border-dashed border-line">
            {proposed.map((v: any) => (
              <li key={v.id} className="py-2.5 text-sm">
                <span className="font-semibold">{v.label}:</span> {v.value}
                {v.location && <span className="ml-2 font-mono text-xs text-muted">{v.location}</span>}
              </li>
            ))}
          </ul>
        )}
        <Link href={`/requests/${requestId}/evidence`}
          className="mt-4 inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-ink px-4 text-sm font-semibold text-paper transition-transform duration-150 hover:scale-[1.01]">
          See the evidence behind each value <ArrowRight size={15} />
        </Link>
      </section>
    </div>
  );
}
