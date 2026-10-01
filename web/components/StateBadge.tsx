import { AlertTriangle, CheckCircle2, CircleDashed, FileQuestion } from "lucide-react";
import { clsx } from "clsx";

const MAP: Record<string, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  verified: { label: "Verified", cls: "bg-moss-wash text-moss-deep border-moss/30", Icon: CheckCircle2 },
  proposed: { label: "Proposed", cls: "bg-amber-wash text-amber border-amber/30", Icon: CircleDashed },
  conflicting: { label: "Conflict", cls: "bg-brick-wash text-brick border-brick/30", Icon: AlertTriangle },
  missing: { label: "Missing", cls: "bg-stone-wash text-muted border-line", Icon: FileQuestion },
};

export function StateBadge({ state, pulse }: { state: string; pulse?: boolean }) {
  const m = MAP[state] ?? MAP.missing;
  const { Icon } = m;
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold tracking-wide",
        m.cls,
      )}
    >
      <Icon size={13} strokeWidth={2.5} className={pulse ? "animate-pulse" : undefined} />
      {m.label}
    </span>
  );
}
