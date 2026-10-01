"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, FileText, Inbox, X } from "lucide-react";
import { clsx } from "clsx";
import { apiAuthed } from "@/lib/api";

type Item = {
  id: string; product_id: string; field_key: string; field_label: string;
  value: string; unit: string | null; location: string | null; created_at: string;
  product_name: string; product_sku: string; document_filename: string | null;
};

export default function ReviewQueue() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await apiAuthed("/api/review-queue");
      setItems(d.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function act(path: string, id: string) {
    setBusy(id); setError("");
    try {
      await apiAuthed(path, { method: "POST" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  async function acceptAll() {
    setBusy("all"); setError("");
    try {
      const out = await apiAuthed("/api/review-queue/accept-all", { method: "POST" });
      const skipped = out.skipped_conflicts > 0 ? ` ${out.skipped_conflicts} conflicting value(s) still need an explicit choice.` : "";
      setError("");
      await load();
      if (out.accepted_count === 0 && out.skipped_conflicts > 0) {
        setError(`Nothing unambiguous to accept.${skipped}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Accept-all failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">FIFO · oldest first</p>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-4xl font-semibold tracking-tight">Review queue</h1>
        {items !== null && (
          <span className="rounded-full bg-amber-wash px-3 py-1 text-sm font-bold tabular-nums text-amber">
            {items.length} pending
          </span>
        )}
      </div>
      <p className="mt-2 max-w-xl text-sm text-inksoft">
        Every AI-proposed value awaiting a human decision, across all dossiers. Accept or reject inline;
        complex cases open in the dossier.
      </p>
      {(items ?? []).length > 0 && (
        <button onClick={() => void acceptAll()} disabled={busy !== null}
          className="mt-3 inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-moss px-5 text-sm font-semibold text-white transition-transform duration-150 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50">
          <Check size={16} strokeWidth={2.5} /> {busy === "all" ? "Accepting…" : `Accept all ${items?.length ?? ""} unambiguous`}
        </button>
      )}
      {error && <p className="mt-4 rounded-xl border border-brick/30 bg-brick-wash p-3.5 text-sm font-medium text-brick">{error}</p>}

      {items === null && <p className="mt-6 text-sm text-muted">Loading queue…</p>}
      {items?.length === 0 && (
        <div className="mt-6 rounded-xl2 border border-moss/30 bg-moss-wash p-8 text-center">
          <Inbox size={28} className="mx-auto text-moss-deep" />
          <p className="mt-3 font-display text-xl font-semibold text-moss-deep">Queue clear</p>
          <p className="mt-1 text-sm text-moss-deep/80">Nothing awaiting review. Upload a document to start the next round.</p>
        </div>
      )}

      <ul className="mt-6 space-y-3">
        {(items ?? []).map((it, i) => (
          <li
            key={it.id}
            style={{ animationDelay: `${Math.min(i, 10) * 0.04}s` }}
            className="animate-rise rounded-xl2 border border-line bg-white/70 p-5 shadow-card"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Link href={`/products/${it.product_id}`} className="font-semibold hover:underline">
                {it.product_name}
              </Link>
              <span className="font-mono text-xs text-muted">{it.product_sku}</span>
              <span className="rounded-full bg-parchment px-2.5 py-0.5 text-xs font-semibold text-inksoft">
                {it.field_label}
              </span>
              <Link
                href={`/products/${it.product_id}`}
                className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-muted transition-colors hover:text-ink"
              >
                Open dossier <ArrowUpRight size={14} />
              </Link>
            </div>
            <p className="mt-2 text-[17px] font-medium leading-relaxed">
              {it.value}{it.unit ? <span className="text-muted"> {it.unit}</span> : null}
            </p>
            <p className="mt-1 flex flex-wrap gap-x-3 font-mono text-xs text-muted">
              {it.location && <span className="inline-flex items-center gap-1"><FileText size={12} />{it.location}</span>}
              {it.document_filename && <span>{it.document_filename}</span>}
              <span>{new Date(it.created_at).toLocaleString()}</span>
            </p>
            <div className="mt-3 flex gap-2">
              <button
                disabled={busy === it.id}
                onClick={() => void act(`/api/fields/${it.id}/accept`, it.id)}
                className={clsx(
                  "inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-moss/40 bg-moss-wash px-3 text-[13px] font-semibold text-moss-deep transition-all duration-150 hover:scale-[1.02] hover:bg-moss hover:text-white active:scale-[0.97] disabled:opacity-50",
                )}
              >
                <Check size={14} strokeWidth={2.5} /> Accept
              </button>
              <button
                disabled={busy === it.id}
                onClick={() => void act(`/api/fields/${it.id}/reject`, it.id)}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-line bg-paper px-3 text-[13px] font-semibold text-inksoft transition-all duration-150 hover:scale-[1.02] hover:border-brick hover:text-brick active:scale-[0.97] disabled:opacity-50"
              >
                <X size={14} strokeWidth={2.5} /> Reject
              </button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
