import { notFound } from "next/navigation";
import { BadgeCheck, Fingerprint } from "lucide-react";
import { apiPublicPassport } from "@/lib/api";

/** Public passport: server-rendered, no auth, label/value/unit only. */
export default async function PassportPage({ params }: { params: { slug: string } }) {
  const data = await apiPublicPassport(params.slug);
  if (!data) notFound();
  return (
    <main className="min-h-screen">
      <div className="border-b border-line bg-parchment/60">
        <div className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-6">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink text-paper">
            <Fingerprint size={18} />
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">TraceFlow</span>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-moss/30 bg-moss-wash px-2.5 py-1 text-xs font-semibold text-moss-deep">
            <BadgeCheck size={13} /> Human-verified passport
          </span>
        </div>
      </div>

      <article className="mx-auto max-w-3xl px-6 py-12">
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted">Digital Product Passport</p>
        <h1 className="mt-2 font-display text-5xl font-semibold tracking-tight">{data.product_name}</h1>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-inksoft">
          Every value below was extracted from supplier evidence and verified by a human reviewer.
          Nothing on this page is AI-proposed, inferred, or unverified.
        </p>

        <div className="ledger-rule my-8" />

        <dl className="overflow-hidden rounded-xl2 border border-line bg-white/70 shadow-card">
          {data.fields.map((f, i) => (
            <div key={f.label} className={i > 0 ? "border-t border-line" : ""}>
              <div className="grid gap-1 px-6 py-4 sm:grid-cols-[220px_1fr] sm:gap-4">
                <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted sm:pt-1">{f.label}</dt>
                <dd className="font-display text-xl font-medium">
                  {f.value}{f.unit ? <span className="text-muted"> {f.unit}</span> : null}
                </dd>
              </div>
            </div>
          ))}
        </dl>

        <p className="mt-8 text-center font-mono text-xs text-muted">
          TraceFlow AI pilot — verified evidence, published once, readable by anyone with this link.
        </p>
      </article>
    </main>
  );
}
