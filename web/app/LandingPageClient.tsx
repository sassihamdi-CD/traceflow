"use client";
import Link from "next/link";
import { Fingerprint, ArrowRight } from "lucide-react";
import { clsx } from "clsx";
import { useTranslations } from "next-intl";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { NextIntlClientProvider } from "next-intl";

type LandingPageClientProps = {
  locale: string;
  messages: any;
};

const STEPS = [
  {
    step: "01",
    titleKey: "landing.steps.upload.title",
    descriptionKey: "landing.steps.upload.description",
    icon: "file-search",
  },
  {
    step: "02",
    titleKey: "landing.steps.review.title",
    descriptionKey: "landing.steps.review.description",
    icon: "check-circle-2",
  },
  {
    step: "03",
    titleKey: "landing.steps.publish.title",
    descriptionKey: "landing.steps.publish.description",
    icon: "award",
  },
] as const;

const ICONS = {
  "file-search": (
    <svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-file-search">
      <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"></path>
      <path d="M14 2v5a1 1 0 0 0 1 1h5"></path>
      <circle cx="11.5" cy="14.5" r="2.5"></circle>
      <path d="M13.3 16.3 15 18"></path>
    </svg>
  ),
  "check-circle-2": (
    <svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-circle-check lucide-check-circle-2">
      <circle cx="12" cy="12" r="10"></circle>
      <path d="m16 9-5.5 5.5L8 12"></path>
    </svg>
  ),
  "award": (
    <svg xmlns="http://www.w3.org/2000/svg" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-award">
      <path d="m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526"></path>
      <circle cx="12" cy="8" r="6"></circle>
    </svg>
  ),
};

export default function LandingPageClient({ locale, messages }: { locale: string; messages: any }) {
  const t = useTranslations("landing");

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <main className="mx-auto max-w-6xl px-6 pb-20">
        <header className="flex h-16 items-center justify-between gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-ink text-paper">
            <Fingerprint size={18} />
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">TraceFlow</span>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Link
              href="/login"
              className="rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-paper transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
            >
              {t("cta")}
              <ArrowRight size={17} className="ml-2 inline transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>
        </header>

        <section className="animate-rise mx-auto max-w-3xl pt-16 text-center md:pt-24">
          <p className="mb-5 inline-block rounded-full border border-line bg-parchment px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-inksoft">
            {t("pilotBadge")}
          </p>
          <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-tight md:text-6xl">{t("title")}</h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-inksoft">{t("subtitle")}</p>
          <div className="mt-8 flex items-center justify-center gap-3">
            <Link
              href="/login"
              className="group inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-ink px-6 font-semibold text-paper transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
            >
              {t("cta")}
              <ArrowRight size={17} className="transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>
        </section>

        <section className="mx-auto mt-16 grid max-w-5xl gap-4 md:grid-cols-3">
          {STEPS.map((s, idx) => (
            <div key={s.step} style={{ animationDelay: `${idx * 0.08}s` }} className="animate-rise rounded-xl2 border border-line bg-white/60 p-6 shadow-card">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-parchment text-ink">
                  {ICONS[s.icon]}
                </span>
                <span className="font-mono text-xs text-muted">{s.step}</span>
              </div>
              <h2 className="mt-4 font-display text-xl font-semibold">{t(s.titleKey)}</h2>
              <p className="mt-2 text-sm leading-relaxed text-inksoft">{t(s.descriptionKey)}</p>
            </div>
          ))}
        </section>

        <p className="mt-14 text-center font-mono text-xs text-muted">{t("footer")}</p>
      </main>
    </NextIntlClientProvider>
  );
}