import { getIronSession } from "iron-session";
import { NextResponse, type NextRequest } from "next/server";
import { dashboardPassword, sessionOptions, type SessionData } from "./lib/auth/session";

export async function proxy(req: NextRequest): Promise<NextResponse> {
  // No password configured → protection disabled (local dev convenience).
  if (!dashboardPassword()) return NextResponse.next();

  const { pathname } = req.nextUrl;
  // The login page and its submit endpoint must stay reachable while unauthenticated.
  if (pathname === "/login" || pathname === "/api/login") return NextResponse.next();

  const res = NextResponse.next();
  const session = await getIronSession<SessionData>(req, res, await sessionOptions());
  if (session.authenticated) return res;

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  if (pathname !== "/") url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

// Protect everything except Next internals, static assets, and the PWA manifest/icons.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/).*)"],
};
