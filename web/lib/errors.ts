/** Human-readable API errors.
 *
 * The backend returns structured failures (see app/errors.py + docs/ERROR_CATALOG.md):
 *   {"detail": {"code": "publish_blocked", "message": "...", "hint": "..."}}
 * This module turns any failure — structured, legacy string, or Pydantic list —
 * into a plain-language Error. The UI must NEVER show raw JSON, status codes,
 * or class names to manufacturers.
 */

export type FriendlyError = Error & { code?: string };

function join(message: string, hint: string): string {
  const m = (message || "").trim();
  const h = (hint || "").trim();
  if (m && h) return `${m} ${h}`;
  return m || h || "Something went wrong.";
}

/** Build a friendly Error from an HTTP status + raw response body. */
export function toFriendly(status: number, bodyText: string): FriendlyError {
  if (status === 401) {
    const e = new Error("SESSION_EXPIRED") as FriendlyError;
    e.code = "session_invalid";
    return e;
  }
  let detail: unknown = null;
  try {
    const parsed = JSON.parse(bodyText || "{}") as { detail?: unknown };
    detail = parsed?.detail ?? null;
  } catch {
    detail = null;
  }
  // Structured catalog error: {code, message, hint}.
  if (detail && typeof detail === "object" && !Array.isArray(detail)) {
    const d = detail as Record<string, unknown>;
    const e = new Error(
      join(String(d.message ?? ""), String(d.hint ?? "")) || "Something went wrong.",
    ) as FriendlyError;
    if (typeof d.code === "string") e.code = d.code;
    return e;
  }
  // Pydantic validation list: [{loc: [...], msg}] -> name the field.
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0] as Record<string, unknown>;
    const loc = Array.isArray(first.loc)
      ? (first.loc as unknown[]).filter((x) => x !== "body").map(String).join(" · ")
      : "";
    const msg = typeof first.msg === "string" ? first.msg : "is invalid";
    const e = new Error(
      join(
        `Some information is ${msg}${loc ? ` (${loc})` : ""}.`,
        "Check the highlighted fields and try again.",
      ),
    ) as FriendlyError;
    e.code = "validation";
    return e;
  }
  // Legacy plain-string detail or unparseable body: show as-is (truncated),
  // never the status code or JSON wrapper.
  const raw = (typeof detail === "string" ? detail : bodyText || "").trim();
  const clean = raw.replace(/^\{"detail":\s*"?/, "").replace(/"?\}$/, "").slice(0, 300);
  const e = new Error(clean || "Something went wrong. Please try again.") as FriendlyError;
  return e;
}

/** Read a failed fetch Response into a friendly Error (consumes the body). */
export async function parseServerError(res: Response): Promise<FriendlyError> {
  let body = "";
  try {
    body = await res.text();
  } catch {
    body = "";
  }
  return toFriendly(res.status, body);
}
