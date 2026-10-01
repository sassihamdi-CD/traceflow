"use client";
import { useState } from "react";
import { Bot, SendHorizonal, UserRound } from "lucide-react";
import { clsx } from "clsx";
import { apiAuthed } from "@/lib/api";

type Msg = { role: "you" | "ai"; text: string };

const SUGGESTIONS = [
  "What do we know about each product and what is still missing?",
  "Which REACH compliance values are verified vs still proposed?",
  "List every open action across all dossiers.",
];

/** Ask your data: authenticated Q&A over the workspace snapshot.
 * Answers cite [SKU → field → document / location] and always separate
 * verified values from proposed ones. */
export default function AskPage() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setError("");
    setMsgs((m) => [...m, { role: "you", text: q }]);
    setInput("");
    setBusy(true);
    try {
      const out = await apiAuthed("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      setMsgs((m) => [...m, { role: "ai", text: out.answer }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ask failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">Workspace Q&A · citations included</p>
      <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight">Ask your data</h1>
      <p className="mt-2 max-w-xl text-sm text-inksoft">
        Answers come only from your workspace — products, values with their evidence, requests, suppliers.
        Verified and proposed values are always separated. Unknown? It says so and points at the gap.
      </p>

      {msgs.length === 0 && (
        <div className="mt-5 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => void send(s)}
              className="min-h-[40px] rounded-xl border border-line bg-white/70 px-4 text-left text-sm font-medium transition-all hover:scale-[1.01] hover:border-ink">
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="mt-5 space-y-3">
        {msgs.map((m, i) => (
          <div key={i} className={clsx("flex gap-3", m.role === "you" ? "justify-end" : "justify-start")}>
            {m.role === "ai" && (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink text-paper">
                <Bot size={16} />
              </span>
            )}
            <div className={clsx(
              "max-w-[80%] whitespace-pre-wrap rounded-xl2 px-4 py-3 text-[15px] leading-relaxed shadow-card",
              m.role === "you" ? "bg-ink text-paper" : "border border-line bg-white/80",
            )}>
              {m.text}
            </div>
            {m.role === "you" && (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-parchment text-ink">
                <UserRound size={16} />
              </span>
            )}
          </div>
        ))}
        {busy && (
          <div className="flex gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink text-paper">
              <Bot size={16} />
            </span>
            <div className="animate-pulse rounded-xl2 border border-line bg-white/80 px-4 py-3 text-sm text-muted">
              Reading your workspace…
            </div>
          </div>
        )}
      </div>

      {error && <p className="mt-3 text-sm font-medium text-brick">{error}</p>}

      <form onSubmit={(e) => { e.preventDefault(); void send(input); }} className="sticky bottom-4 mt-5 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about products, values, evidence, gaps…"
          maxLength={2000}
          className="min-h-[48px] flex-1 rounded-xl border border-line bg-white/90 px-4 text-[15px] shadow-card outline-none transition-shadow placeholder:text-muted/70 focus:border-ink focus:ring-2 focus:ring-ink/15"
        />
        <button type="submit" disabled={busy || !input.trim()}
          className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-ink px-5 font-semibold text-paper transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50">
          <SendHorizonal size={17} /> Ask
        </button>
      </form>
    </>
  );
}
