"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { clsx } from "clsx";
import { apiAuthed } from "@/lib/api";
import { FIELD_GROUPS, groupReadiness } from "@/lib/groups";
import { ReadinessRing } from "@/components/ReadinessRing";

export const STAGES = [
  { key: "request", n: "01", label: "Client Request" },
  { key: "structure", n: "02", label: "Structure" },
  { key: "evidence", n: "03", label: "Evidence" },
  { key: "verify", n: "04", label: "Verify" },
  { key: "gaps", n: "05", label: "Identify Gaps" },
  { key: "respond", n: "06", label: "Respond" },
] as const;

export type StageKey = (typeof STAGES)[number]["key"];

type Ctx = {
  data: any | null;
  reload: () => Promise<void>;
  requestId: string;
};

const RequestCtx = createContext<Ctx>({ data: null, reload: async () => {}, requestId: "" });
export const useRequest = () => useContext(RequestCtx);

export function RequestWorkspace({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const pathname = usePathname();
  const requestId = params.id as string;
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    try {
      setData(await apiAuthed(`/api/requests/${requestId}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    }
  }, [requestId]);

  useEffect(() => { void reload(); }, [reload]);

  if (!data) {
    return (
      <>
        <div className="animate-pulse space-y-3">
          <div className="h-10 w-2/3 rounded-lg bg-parchment" />
          <div className="h-64 rounded-xl2 bg-parchment" />
        </div>
        {error && <p className="mt-4 text-sm font-medium text-brick">{error}</p>}
      </>
    );
  }

  const { request, dossier, gaps, followups } = data;
  const activeIdx = Math.max(0, STAGES.findIndex((s) => pathname.endsWith(`/${s.key}`)));
  const openFollowups = followups.filter((f: any) => f.status !== "resolved").length;

  return (
    <RequestCtx.Provider value={{ data, reload, requestId }}>
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">
        {request.requester_org ?? "Client request"} → {dossier.product.name}
      </p>
      <h1 className="mt-1 max-w-3xl font-display text-3xl font-semibold tracking-tight md:text-4xl">
        {request.subject}
      </h1>

      <ol className="mt-5 flex flex-wrap gap-1.5">
        {STAGES.map((s, i) => {
          const active = i === activeIdx;
          const done = i < activeIdx;
          return (
            <li key={s.key}>
              <Link
                href={`/requests/${requestId}/${s.key}`}
                className={clsx(
                  "flex min-h-[40px] items-center gap-2 rounded-lg border px-3 text-[13px] font-semibold transition-all duration-150",
                  active
                    ? "border-ink bg-ink text-paper"
                    : done
                      ? "border-moss/40 bg-moss-wash text-moss-deep hover:bg-moss hover:text-white"
                      : "border-line bg-white/60 text-inksoft hover:border-ink hover:text-ink",
                )}
              >
                <span className="font-mono text-[11px] opacity-70">{s.n}</span>
                {s.label}
              </Link>
            </li>
          );
        })}
      </ol>

      <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="min-w-0">{children}</div>
        <aside className="lg:sticky lg:top-8 lg:self-start">
          <div className="rounded-xl2 border border-line bg-white/70 p-5 shadow-card">
            <div className="flex justify-center">
              <ReadinessRing percent={dossier.readiness_percent} size={110} />
            </div>
            <p className="mt-2 text-center text-[13px] text-inksoft">
              <strong className="tabular-nums">{dossier.counts.verified}/{dossier.total_required}</strong> verified ·{" "}
              <strong className="tabular-nums">{dossier.actions_required}</strong> open
            </p>
            <div className="ledger-rule my-4" />
            <ul className="space-y-2.5">
              {FIELD_GROUPS.map((g) => {
                const r = groupReadiness(dossier.fields, g);
                const pct = r.total ? Math.round((r.verified / r.total) * 100) : 100;
                return (
                  <li key={g.key}>
                    <div className="flex items-baseline justify-between text-[13px]">
                      <span className="font-medium">{g.title}</span>
                      <span className="font-mono text-xs text-muted tabular-nums">{r.verified}/{r.total}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-parchment">
                      <div className="h-full rounded-full bg-moss transition-[width] duration-700 ease-out" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="ledger-rule my-4" />
            <p className="text-[13px] text-inksoft">
              Supplier follow-up:{" "}
              {openFollowups === 0 ? (
                <span className="font-medium text-muted">none prepared</span>
              ) : (
                <Link href={`/requests/${requestId}/gaps`} className="font-semibold text-amber hover:underline">
                  {openFollowups} open
                </Link>
              )}
            </p>
            <p className="mt-1 font-mono text-[11px] text-muted">
              {request.status === "responded" ? "● responded" : "○ draft — not ready to send"}
            </p>
          </div>
        </aside>
      </div>
    </RequestCtx.Provider>
  );
}
