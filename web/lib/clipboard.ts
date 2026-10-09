"use client";

/** Clipboard write that works on HTTP/insecure contexts and when permission
 * is denied: tries navigator.clipboard, falls back to a hidden textarea +
 * document.execCommand("copy"). Throws only if every path fails. */
export async function copyText(text: string): Promise<void> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
    throw new Error("clipboard API unavailable");
  } catch {
    // Fallback for HTTP, insecure contexts, denied permissions.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    document.body.removeChild(ta);
    if (!ok) throw new Error("Copy failed — select the text manually.");
  }
}
