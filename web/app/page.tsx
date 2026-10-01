"use client";
import Link from "next/link";
import { ArrowRight, Award, CheckCircle2, FileSearch, Fingerprint } from "lucide-react";

const STEPS = [
  { Icon: FileSearch, title: "Upload evidence", text: "BOMs, declarations, certificates. Claude reads layout and tables, citing the exact page or cell." },
  { Icon: CheckCircle2, title: "Review every value", text: "Accept, correct, or reject each proposal. Nothing reaches the passport unverified — conflicts resolve explicitly." },
  { Icon: Award, title: "Publish the passport", text: "Only when all 7 fields verify. A public, auditor-ready page behind a link or QR code." },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-6 pb-20">
      <header className="flex h-16 items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink text-paper">
          <Fingerprint size={18} />
        </span>
        <span className="font-display text-lg font-semibold tracking-tight">TraceFlow</span>
        <Link href="/login" className="ml-auto rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-paper transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]">
          Reviewer sign in
        </Link>
      </header>

      <section className="animate-rise mx-auto max-w-3xl pt-16 text-center md:pt-24">
        <p className="mb-5 inline-block rounded-full border border-line bg-parchment px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-inksoft">
          Digital Product Passport · Pilot
        </p>
        <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
          Every claim in the passport, traced to its page.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-inksoft">
          Supplier documents in. AI-extracted values with exact evidence locations. A human verifies each one before it can ever go public.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link href="/login" className="group inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-ink px-6 font-semibold text-paper transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]">
            Open the reviewer console
            <ArrowRight size={17} className="transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        </div>
      </section>

      <section className="mx-auto mt-16 grid max-w-5xl gap-4 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <div
            key={s.title}
            style={{ animationDelay: `${0.1 + i * 0.08}s` }}
            className="animate-rise rounded-xl2 border border-line bg-white/60 p-6 shadow-card"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-parchment text-ink">
                <s.Icon size={19} />
              </span>
              <span className="font-mono text-xs text-muted">0{i + 1}</span>
            </div>
            <h2 className="mt-4 font-display text-xl font-semibold">{s.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-inksoft">{s.text}</p>
          </div>
        ))}
      </section>

      <p className="mt-14 text-center font-mono text-xs text-muted">
        AI proposes · humans verify · the public sees only verified values
      </p>
    </main>
  );
}
