import { notFound } from "next/navigation";
import { getRequestConfig } from "next-intl/server";

export const locales = ["en", "it"] as const;
export const defaultLocale = "en" as const;

export type Locale = (typeof locales)[number];

export default getRequestConfig(async ({ locale }) => {
  if (!locales.includes(locale as Locale)) notFound();

  const loc = locale as Locale;

  return {
    locale: loc,
    messages: (await import(`../messages/${loc}.json`)).default,
  };
});