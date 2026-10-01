"use client";
import { useEffect, useState } from "react";
import { Copy, X } from "lucide-react";

/** Editable email draft modal: subject + body are editable, Copy takes both.
 * The reviewer sends from their own mailbox — the app never sends. */
export function EmailDraftModal({
  initialSubject,
  initialBody,
  hasSignature,
  onClose,
}: {
  initialSubject: string;
  initialBody: string;
  hasSignature: boolean;
  onClose: () => void;
}) {
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setSubject(initialSubject);
    setBody(initialBody);
    setCopied(false);
  }, [initialSubject, initialBody]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function copy() {
    await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/50 p-4" onClick={onClose}>
      <div
        className="animate-rise flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl2 bg-paper shadow-pop"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Supplier email draft"
      >
        <div className="flex items-center gap-3 border-b border-line px-6 py-4">
          <h2 className="font-display text-xl font-semibold">Supplier email — edit, then copy</h2>
          <button onClick={onClose} aria-label="Close"
            className="ml-auto flex h-10 w-10 items-center justify-center rounded-lg text-muted transition-colors hover:bg-parchment hover:text-ink">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-4 overflow-y-auto px-6 py-5">
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted" htmlFor="mail-subject">
              Subject
            </label>
            <input id="mail-subject" value={subject} onChange={(e) => setSubject(e.target.value)}
              className="mt-2 min-h-[44px] w-full rounded-lg border border-line bg-white px-3.5 text-[15px] outline-none focus:border-ink focus:ring-2 focus:ring-ink/15" />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-[0.12em] text-muted" htmlFor="mail-body">
              Body {hasSignature ? "· your signature is appended" : "· no signature set (Account page)"}
            </label>
            <textarea id="mail-body" rows={14} value={body} onChange={(e) => setBody(e.target.value)}
              className="mt-2 w-full rounded-lg border border-line bg-white px-3.5 py-3 font-mono text-[13px] leading-relaxed outline-none focus:border-ink focus:ring-2 focus:ring-ink/15" />
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-line px-6 py-4">
          <button onClick={() => void copy()}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-ink px-6 font-semibold text-paper transition-transform duration-150 hover:scale-[1.01] active:scale-[0.99]">
            <Copy size={16} /> {copied ? "Copied to clipboard" : "Copy email"}
          </button>
          <span className="ml-auto font-mono text-[11px] text-muted">Paste into your mailbox — sending stays manual.</span>
        </div>
      </div>
    </div>
  );
}
