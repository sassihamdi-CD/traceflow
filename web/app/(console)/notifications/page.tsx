"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { BellRing, CheckCheck, Plus } from "lucide-react";
import { clsx } from "clsx";
import { apiIntake, apiMarkRead, apiNotifications, apiReadAll } from "@/lib/api";

type Notif = {
  id: string; type: string; title: string; body: string | null;
  entity_type: string | null; entity_id: string | null;
  read_at: string | null; created_at: string | null;
};

export default function NotificationsPage() {
  const [items, setItems] = useState<Notif[] | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ subject: "", from_email: "", body_text: "" });
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ request_id: string; items_count: number } | null>(null);

  const reload = () =>
    apiNotifications(false, 100)
      .then((d) => {
        setItems(d.items);
        setUnreadCount(d.unread_count);
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function markRead(id: string) {
    try {
      await apiMarkRead(id);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mark-read failed");
    }
  }

  async function readAll() {
    try {
      await apiReadAll();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Read-all failed");
    }
  }

  async function submitIntake(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCreated(null);
    setBusy(true);
    try {
      const out = await apiIntake(form.subject, form.body_text, form.from_email || undefined);
      setCreated(out);
      setForm({ subject: "", from_email: "", body_text: "" });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Intake failed");
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "mt-2 min-h-[44px] w-full rounded-lg border border-line bg-paper px-3.5 text-[15px] outline-none transition-shadow duration-150 placeholder:text-muted/70 focus:border-ink focus:ring-2 focus:ring-ink/15";

  return (
    <>
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">Manager inbox</p>
          <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">Notifications</h1>
        </div>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-ink px-5 font-semibold text-paper transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
          >
            <Plus size={17} /> New intake
          </button>
          {unreadCount > 0 && (
            <button
              onClick={() => void readAll()}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-line bg-white/70 px-5 font-semibold transition-colors hover:bg-parchment/60"
            >
              <CheckCheck size={17} /> Mark all read
            </button>
          )}
        </div>
      </div>
      {error && <p className="mt-4 rounded-xl border border-brick/30 bg-brick-wash p-3.5 text-sm font-medium text-brick">{error}</p>}

      {showForm && (
        <form onSubmit={submitIntake} className="animate-rise mt-5 grid gap-4 rounded-xl2 border border-line bg-white/70 p-6 shadow-card md:grid-cols-2">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted md:col-span-2">
            Paste the client&apos;s email — requirements are extracted verbatim and the manager is notified
          </p>
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted" htmlFor="ni-subject">Subject</label>
            <input id="ni-subject" required placeholder="Product request — Trail Blazer GTX" value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted" htmlFor="ni-from">From (email)</label>
            <input id="ni-from" placeholder="buyer@example.com" value={form.from_email}
              onChange={(e) => setForm({ ...form, from_email: e.target.value })} className={inputCls} />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted" htmlFor="ni-body">Email body</label>
            <textarea id="ni-body" required rows={5} placeholder="Paste the full email body here…" value={form.body_text}
              onChange={(e) => setForm({ ...form, body_text: e.target.value })}
              className="mt-2 w-full rounded-lg border border-line bg-paper px-3.5 py-3 text-[15px] outline-none transition-shadow duration-150 placeholder:text-muted/70 focus:border-ink focus:ring-2 focus:ring-ink/15" />
          </div>
          <div className="md:col-span-2">
            <button type="submit" disabled={busy} className="inline-flex min-h-[44px] items-center rounded-xl bg-moss px-6 font-semibold text-white transition-transform duration-150 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50">
              {busy ? "Extracting…" : "Create intake"}
            </button>
            {created && (
              <p className="mt-3 text-sm font-medium text-moss-deep">
                Intake created — {created.items_count} requirement{created.items_count === 1 ? "" : "s"} itemized.{" "}
                <Link href={`/requests/${created.request_id}/request`} className="underline">
                  Open request
                </Link>
              </p>
            )}
          </div>
        </form>
      )}

      <div className="mt-6 overflow-hidden rounded-xl2 border border-line bg-white/70 shadow-card">
        <ul className="divide-y divide-line">
          {(items ?? []).map((n) => (
            <li
              key={n.id}
              className={clsx("flex items-start gap-4 px-5 py-4", !n.read_at && "bg-amber-wash/40")}
            >
              <BellRing size={18} className={clsx("mt-1 shrink-0", n.read_at ? "text-muted" : "text-amber")} />
              <div className="min-w-0 flex-1">
                <p className={clsx(!n.read_at && "font-semibold")}>{n.title}</p>
                {n.body && <p className="mt-1 line-clamp-2 text-[13px] text-inksoft">{n.body}</p>}
                <p className="mt-1 font-mono text-xs text-muted">
                  {n.created_at ? new Date(n.created_at).toLocaleString() : ""} · {n.type}
                  {n.entity_id && (
                    <>
                      {" · "}
                      <Link href={`/requests/${n.entity_id}/request`} className="underline">
                        Open request
                      </Link>
                    </>
                  )}
                </p>
              </div>
              {!n.read_at && (
                <button
                  onClick={() => void markRead(n.id)}
                  className="inline-flex min-h-[40px] shrink-0 items-center rounded-lg border border-line px-3 text-sm font-semibold transition-colors hover:bg-parchment/60"
                >
                  Mark read
                </button>
              )}
            </li>
          ))}
        </ul>
        {items?.length === 0 && <p className="px-5 py-8 text-center text-sm text-muted">No notifications yet.</p>}
        {items === null && !error && <p className="px-5 py-8 text-center text-sm text-muted">Loading…</p>}
      </div>
    </>
  );
}
