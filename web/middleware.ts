import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getMiddlewareUser, updateSession } from "./utils/supabase/middleware";

/**
 * Refreshes the Supabase session on every request. The public passport
 * route (/passport/*) and landing (/) NEVER require auth; console routes
 * redirect to /login when verified getUser() returns no user.
 *
 * NOTE (Phase 2b TODO): invite-gating (e.g. restricting console access to
 * invited/redeemed users) must be enforced server-side via a backend redeem
 * endpoint + DB check — never trust client-side flags or cookie presence.
 * Middleware here only verifies authentication, not authorization/invites.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/_next") || pathname === "/favicon.ico" || pathname.startsWith("/api/")) {
    return NextResponse.next();
  }
  // Public: landing + isolated public passport route. /login refreshes
  // its own session but never redirects.
  if (pathname === "/" || pathname.startsWith("/passport") || pathname === "/founder") {
    return NextResponse.next();
  }
  if (pathname === "/login") {
    return await updateSession(req);
  }
  const res = await updateSession(req);
  // Verified check (not a cookie-name heuristic): getUser() validates the
  // JWT with Supabase. Redirect unauthenticated console paths to /login.
  const { user } = await getMiddlewareUser(req);
  if (!user) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"] };
