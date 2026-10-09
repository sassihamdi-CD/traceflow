"use client";
import { useEffect, useState } from "react";
import { NextIntlClientProvider } from "next-intl";

const LOCALES = ["en", "it"] as const;
type Locale = typeof LOCALES[number];
const DEFAULT_LOCALE: Locale = "en";
const LOCALE_COOKIE = "tf_locale";

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);
  const [messages, setMessages] = useState<any>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const cookies = document.cookie.split("; ").reduce((acc, cookie) => {
      const [key, value] = cookie.split("=");
      acc[key] = value;
      return acc;
    }, {} as Record<string, string>);
    
    const cookieLocale = cookies[LOCALE_COOKIE];
    const initialLocale = (cookieLocale && LOCALES.includes(cookieLocale as Locale)) 
      ? (cookieLocale as Locale) 
      : DEFAULT_LOCALE;
    
    setLocale(initialLocale);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    loadMessages(locale);
  }, [locale, mounted]);

  const loadMessages = async (loc: Locale) => {
    try {
      const res = await fetch(`/api/messages?locale=${loc}`);
      if (res.ok) {
        const msgs = await res.json();
        setMessages(msgs);
      }
    } catch {
      try {
        const res = await fetch(`/api/messages?locale=en`);
        if (res.ok) {
          const msgs = await res.json();
          setMessages(msgs);
        }
      } catch {
        console.error("Failed to load messages");
      }
    }
  };

  // During SSR/static generation, render children without provider (messages=null)
  // Client-side, wait for messages to load
  if (!mounted) {
    return <>{children}</>;
  }

  if (!messages) {
    return <>{children}</>;
  }

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}