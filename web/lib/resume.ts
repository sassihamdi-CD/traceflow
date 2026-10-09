"use client";

/** Last-stage + form-draft resume (localStorage, per-browser, best-effort).
 * Keys survive sign-out on purpose — login redirects back to the last spot. */

const LAST_LOCATION_KEY = "tf_last_location";
const DRAFT_PREFIX = "tf_draft:";

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // private mode / quota — resume is best-effort
  }
}

/** Persist the last console location (requests stage or dossier). */
export function saveLastLocation(path: string): void {
  if (typeof window === "undefined") return;
  if (path.startsWith("/requests/") || path.startsWith("/products/")) {
    safeSet(LAST_LOCATION_KEY, path);
  }
}

/** Location to land on after login (validated to a console path). */
export function getResumeLocation(): string | null {
  if (typeof window === "undefined") return null;
  const v = safeGet(LAST_LOCATION_KEY);
  if (v && (v.startsWith("/requests/") || v.startsWith("/products/"))) return v;
  return null;
}

export function clearResumeLocation(): void {
  try {
    window.localStorage.removeItem(LAST_LOCATION_KEY);
  } catch {
    // ignore
  }
}

/** Per-scope JSON draft (e.g. `request:<id>:gaps`, `product:<id>:edit`). */
export function saveDraft<T>(scope: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    safeSet(DRAFT_PREFIX + scope, JSON.stringify(value));
  } catch {
    // ignore
  }
}

export function loadDraft<T>(scope: string): T | null {
  if (typeof window === "undefined") return null;
  const raw = safeGet(DRAFT_PREFIX + scope);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
