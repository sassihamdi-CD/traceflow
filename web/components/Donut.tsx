"use client";

const SEGS = [
  ["verified", "#2F5D3A"],
  ["proposed", "#C08A2D"],
  ["conflicting", "#A83A26"],
  ["missing", "#D8D1BE"],
] as const;

/** Animated donut of aggregate field states across the pipeline. */
export function Donut({ counts, size = 168 }: { counts: Record<string, number>; size?: number }) {
  const total = SEGS.reduce((a, [k]) => a + (counts[k] ?? 0), 0) || 1;
  const r = (size - 20) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {SEGS.map(([k, color]) => {
            const frac = (counts[k] ?? 0) / total;
            const el = (
              <circle
                key={k}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={color}
                strokeWidth={18}
                strokeDasharray={`${Math.max(frac * c - 2, 0.5)} ${c}`}
                strokeDashoffset={-acc * c}
                strokeLinecap="butt"
                className="transition-all duration-700 ease-out"
              />
            );
            acc += frac;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-3xl font-semibold tabular-nums">{total}</span>
          <span className="text-[11px] uppercase tracking-[0.14em] text-muted">fields</span>
        </div>
      </div>
      <ul className="space-y-2 text-sm">
        {SEGS.map(([k, color]) => (
          <li key={k} className="flex items-center gap-2.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
            <span className="capitalize text-inksoft">{k}</span>
            <span className="ml-auto pl-4 font-semibold tabular-nums">{counts[k] ?? 0}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
