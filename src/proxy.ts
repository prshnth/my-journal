import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "./lib/auth/session";

// Read at runtime (computed key avoids build-time inlining), so the password is supplied
// by the container environment at deploy time and never baked into the image.
const PASS_KEY = "DASHBOARD_PASSWORD";

export async function proxy(req: NextRequest): Promise<NextResponse> {
  const password = process.env[PASS_KEY] ?? "";
  // No password configured → protection disabled (local dev convenience).
  if (!password) return NextResponse.next();

  const { pathname } = req.nextUrl;
  // The login page (and the server-action POST it submits to) must stay reachable.
  if (pathname === "/login") return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySessionToken(password, token)) return NextResponse.next();

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
