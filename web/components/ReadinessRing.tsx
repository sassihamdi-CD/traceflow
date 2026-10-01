"use client";
import { motion, useReducedMotion } from "motion/react";

export function ReadinessRing({ percent, size = 120 }: { percent: number; size?: number }) {
  const reduce = useReducedMotion();
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  const target = c - (Math.min(100, Math.max(0, percent)) / 100) * c;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E3DCCB" strokeWidth={10} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={percent >= 100 ? "#2F5D3A" : percent >= 50 ? "#A86A12" : "#A83A26"}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: target }}
          transition={{ duration: reduce ? 0.1 : 0.9, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute text-center">
        <div className="font-display text-3xl font-semibold tabular-nums">{percent}<span className="text-lg">%</span></div>
        <div className="text-[11px] uppercase tracking-[0.14em] text-muted">ready</div>
      </div>
    </div>
  );
}
