import { createClient } from "@/utils/supabase/client";

const API = process.env.NEXT_PUBLIC_API_URL!;

export function supabaseBrowser() {
  return createClient();
}

/** Authenticated API call from the reviewer console (Supabase session token). */
export async function apiAuthed(path: string, init: RequestInit = {}) {
  const supabase = createClient();

  const getToken = async (): Promise<string | null> => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  };

  const truncate = (body: string, max = 300): string =>
    body.length > max ? `${body.slice(0, max)}…` : body;

  const doFetch = async (token: string, signal: AbortSignal) => {
    const res = await fetch(`${API}${path}`, {
      ...init,
      signal,
      headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` },
    });
    return res;
  };

  const throwForStatus = async (res: Response): Promise<never> => {
    if (res.status === 401) throw new Error("SESSION_EXPIRED");
    let body = "";
    try {
      body = await res.text();
    } catch {
      body = "";
    }
    throw new Error(`Request failed: ${res.status}${body ? ` ${truncate(body)}` : ""}`);
  };

  const withTimeout = async <T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      return await fn(controller.signal);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new Error("Request timed out after 15s");
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  };

  let token = await getToken();
  if (!token) {
    // Session may be expired but refreshable — try once before giving up.
    try {
      const { data } = await supabase.auth.refreshSession();
      token = data.session?.access_token ?? null;
    } catch {
      token = null;
    }
  }
  if (!token) throw new Error("SESSION_EXPIRED");

  try {
    const res = await withTimeout((signal) => doFetch(token as string, signal));
    if (res.ok) return res.json();
    if (res.status !== 401) await throwForStatus(res);
    // 401: access token may be stale — refresh once and retry once.
    try {
      await res.body?.cancel().catch(() => {});
    } catch {
      // ignore body-cancel errors before retry
    }
    const { data: refreshed } = await supabase.auth.refreshSession();
    const retryToken = refreshed.session?.access_token;
    if (!retryToken) throw new Error("SESSION_EXPIRED");
    const retryRes = await withTimeout((signal) => doFetch(retryToken, signal));
    if (retryRes.ok) return retryRes.json();
    await throwForStatus(retryRes);
  } catch (err) {
    // Preserve our intentional sentinel + status errors without wrapping.
    if (err instanceof Error) throw err;
    throw new Error("Request failed");
  }
  // Unreachable — throwForStatus always throws.
  throw new Error("Request failed");
}

/** Public passport fetch: NO auth header, hits the isolated public route only. */
export async function apiPublicPassport(slug: string) {
  const res = await fetch(`${API}/api/public/passport/${slug}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Passport fetch failed: ${res.status}`);
  return res.json() as Promise<{ product_name: string; fields: { label: string; value: string; unit: string | null }[] }>;
}

/** Redeem result: workspace membership created for the signed-in user. */
export type InviteRedeemResult = {
  workspace: string;
  role: string;
};

/** Redeem an invite code for the signed-in user (Supabase session token).
 * Mirrors apiAuthed: 15s timeout, 401 refresh-once, truncated errors. */
export async function apiRedeemInvite(code: string): Promise<InviteRedeemResult> {
  const supabase = createClient();

  const getToken = async (): Promise<string | null> => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  };

  const truncate = (body: string, max = 300): string =>
    body.length > max ? `${body.slice(0, max)}…` : body;

  const doFetch = async (token: string, signal: AbortSignal) => {
    const res = await fetch(`${API}/api/invites/redeem`, {
      method: "POST",
      signal,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    return res;
  };

  const throwForStatus = async (res: Response): Promise<never> => {
    if (res.status === 401) throw new Error("SESSION_EXPIRED");
    let body = "";
    try {
      body = await res.text();
    } catch {
      body = "";
    }
    throw new Error(`Request failed: ${res.status}${body ? ` ${truncate(body)}` : ""}`);
  };

  const withTimeout = async <T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      return await fn(controller.signal);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new Error("Request timed out after 15s");
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  };

  let token = await getToken();
  if (!token) {
    try {
      const { data } = await supabase.auth.refreshSession();
      token = data.session?.access_token ?? null;
    } catch {
      token = null;
    }
  }
  if (!token) throw new Error("SESSION_EXPIRED");

  const parseResult = (data: unknown): InviteRedeemResult => {
    const rec = (data ?? {}) as Record<string, unknown>;
    const workspace = String(rec.workspace ?? rec.workspace_id ?? rec.workspace_name ?? "");
    const role = String(rec.role ?? "");
    return { workspace, role };
  };

  try {
    const res = await withTimeout((signal) => doFetch(token as string, signal));
    if (res.ok) return parseResult(await res.json());
    if (res.status !== 401) await throwForStatus(res);
    try {
      await res.body?.cancel().catch(() => {});
    } catch {
      // ignore body-cancel errors before retry
    }
    const { data: refreshed } = await supabase.auth.refreshSession();
    const retryToken = refreshed.session?.access_token;
    if (!retryToken) throw new Error("SESSION_EXPIRED");
    const retryRes = await withTimeout((signal) => doFetch(retryToken, signal));
    if (retryRes.ok) return parseResult(await retryRes.json());
    await throwForStatus(retryRes);
  } catch (err) {
    if (err instanceof Error) throw err;
    throw new Error("Request failed");
  }
  throw new Error("Request failed");
}

/** Notification center: list (newest first), with unread count. */
export async function apiNotifications(unreadOnly = false, limit = 50) {
  const q = `?unread_only=${unreadOnly ? "true" : "false"}&limit=${Math.max(1, Math.min(limit, 100))}`;
  return apiAuthed(`/api/notifications${q}`) as Promise<{
    items: { id: string; type: string; title: string; body: string | null; entity_type: string | null; entity_id: string | null; read_at: string | null; created_at: string | null }[];
    unread_count: number;
  }>;
}

/** Mark one notification read. */
export async function apiMarkRead(id: string) {
  return apiAuthed(`/api/notifications/${id}/read`, { method: "POST" });
}

/** Mark all notifications read. */
export async function apiReadAll() {
  return apiAuthed("/api/notifications/read-all", { method: "POST" }) as Promise<{ ok: boolean; marked: number }>;
}

/** Email-ready intake: paste subject + body, itemize requirements, notify manager. */
export async function apiIntake(subject: string, body_text: string, from_email?: string) {
  return apiAuthed("/api/intake", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subject, body_text, from_email }),
  }) as Promise<{ request_id: string; items_count: number }>;
}
