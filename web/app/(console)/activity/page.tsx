"use client";
import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { apiAuthed } from "@/lib/api";

type Entry = {
  actor: string; action: string; entity_type: string;
  entity_id: string; detail: unknown; created_at: string;
};

const ACTION_TONE: Record<string, string> = {
  "field.accepted": "bg-moss-wash text-moss-deep",
  "field.corrected": "bg-moss-wash text-moss-deep",
  "field.rejected": "bg-stone-wash text-muted",
  "field.conflict_resolved": "bg-brick-wash text-brick",
  "document.uploaded": "bg-amber-wash text-amber",
  "passport.published": "bg-ink text-paper",
};

export default function ActivityPage() {
  const [items, setItems] = useState<Entry[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiAuthed("/api/activity?limit=100").then((d) => setItems(d.items)).catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">Insert-only · newest first</p>
      <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">Activity</h1>
      <p className="mt-2 max-w-xl text-sm text-inksoft">
        The audit trail: every proposal, decision, upload, and publication. The app role cannot
        rewrite this history — the database itself refuses UPDATE and DELETE.
      </p>
      {error && <p className="mt-4 rounded-xl border border-brick/30 bg-brick-wash p-3.5 text-sm font-medium text-brick">{error}</p>}

      <div className="mt-6 overflow-hidden rounded-xl2 border border-line bg-white/70 shadow-card">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line bg-parchment/60 text-xs uppercase tracking-[0.1em] text-muted">
              <th className="px-5 py-3 font-semibold">When</th>
              <th className="px-5 py-3 font-semibold">Action</th>
              <th className="px-5 py-3 font-semibold">Actor</th>
              <th className="px-5 py-3 font-semibold">Entity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items?.map((a, i) => (
              <tr key={`${a.created_at}-${i}`} className="transition-colors hover:bg-parchment/50">
                <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-muted">
                  {new Date(a.created_at).toLocaleString()}
                </td>
                <td className="px-5 py-3">
                  <span className={clsx("rounded-full px-2.5 py-0.5 font-mono text-xs font-semibold", ACTION_TONE[a.action] ?? "bg-stone-wash text-inksoft")}>
                    {a.action}
                  </span>
                </td>
                <td className="max-w-[220px] truncate px-5 py-3 font-mono text-xs">{a.actor}</td>
                <td className="px-5 py-3 font-mono text-xs text-muted">{a.entity_type} · {a.entity_id.slice(0, 8)}…</td>
              </tr>
            ))}
          </tbody>
        </table>
        {items?.length === 0 && <p className="px-5 py-8 text-center text-sm text-muted">No activity yet.</p>}
        {items === null && !error && <p className="px-5 py-8 text-center text-sm text-muted">Loading…</p>}
      </div>
    </>
  );
}
