"use client";
import { useRouter } from "next/navigation";
import { Globe, ChevronDown, Check } from "lucide-react";
import { clsx } from "clsx";
import { useState, useRef, useEffect } from "react";

const LOCALES = [
  { code: "en", name: "English", flag: "🇬🇧" },
  { code: "it", name: "Italiano", flag: "🇮🇹" },
] as const;

const LOCALE_COOKIE = "tf_locale";

export function LanguageSwitcher() {
  const router = useRouter();
  const [locale, setLocale] = useState(() => {
    if (typeof window === "undefined") return "en";
    const cookies = document.cookie.split("; ").reduce((acc, cookie) => {
      const [key, value] = cookie.split("=");
      acc[key] = value;
      return acc;
    }, {} as Record<string, string>);
    return cookies[LOCALE_COOKIE] || "en";
  });
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const switchLocale = (newLocale: string) => {
    setLocale(newLocale);
    document.cookie = `${LOCALE_COOKIE}=${newLocale}; path=/; max-age=31536000; SameSite=Lax`;
    window.location.reload();
    setIsOpen(false);
  };

  const currentLocale = LOCALES.find((l) => l.code === locale) || LOCALES[0];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="inline-flex items-center gap-2 min-h-[40px] px-3 rounded-xl border border-line bg-white/70 hover:border-ink hover:bg-white transition-all text-sm font-medium"
        aria-label="Change language"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <Globe size={16} className="text-muted" />
        <span className="hidden sm:inline">{currentLocale.flag} {currentLocale.name}</span>
        <span className="sm:hidden">{currentLocale.flag}</span>
        <ChevronDown size={14} className={clsx("text-muted transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-40 rounded-xl border border-line bg-white shadow-lg overflow-hidden z-50 animate-fade-in">
          <ul role="listbox" aria-label="Select language">
            {LOCALES.map((l) => (
              <li key={l.code}>
                <button
                  onClick={() => switchLocale(l.code)}
                  role="option"
                  aria-selected={l.code === locale}
                  className={clsx(
                    "w-full px-4 py-2.5 text-left text-sm font-medium transition-colors flex items-center gap-2",
                    l.code === locale
                      ? "bg-ink/5 text-ink"
                      : "text-inksoft hover:bg-line/50"
                  )}
                >
                  <span>{l.flag}</span>
                  <span>{l.name}</span>
                  {l.code === locale && <Check size={14} className="ml-auto text-ink" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <style jsx>{`
        .animate-fade-in {
          animation: fadeIn 150ms ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}