import { NextResponse, type NextRequest } from "next/server";

// Read at runtime, not build time. Computed-key access (process.env[KEY]) is not
// inlined by the bundler, so the password is supplied by the container environment
// at deploy time and never baked into the image.
const USER_KEY = "DASHBOARD_USER";
const PASS_KEY = "DASHBOARD_PASSWORD";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function unauthorized(): NextResponse {
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="my journal", charset="UTF-8"' },
  });
}

export function proxy(req: NextRequest): NextResponse {
  const password = process.env[PASS_KEY] ?? "";
  // No password configured → protection disabled (local dev convenience).
  if (!password) return NextResponse.next();

  const expectedUser = process.env[USER_KEY] || "journal";

  const header = req.headers.get("authorization") ?? "";
  if (header.startsWith("Basic ")) {
    let decoded = "";
    try {
      decoded = atob(header.slice("Basic ".length));
    } catch {
      return unauthorized();
    }
    const sep = decoded.indexOf(":");
    if (sep !== -1) {
      const user = decoded.slice(0, sep);
      const pass = decoded.slice(sep + 1);
      if (timingSafeEqual(user, expectedUser) && timingSafeEqual(pass, password)) {
        return NextResponse.next();
      }
    }
  }
  return unauthorized();
}

// Protect everything except Next internals and static assets.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
