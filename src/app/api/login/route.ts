import { getIronSession } from "iron-session";
import { NextResponse, type NextRequest } from "next/server";
import { dashboardPassword, sessionOptions, type SessionData } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

// We send a RELATIVE Location (just the path). The browser resolves it against the public
// URL in its address bar, so this works behind Caddy — building an absolute URL from
// req.url would leak the internal http://localhost:3000 host.
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const password = dashboardPassword();
  const submitted = String(form.get("password") ?? "");
  const nextParam = String(form.get("next") ?? "");
  const dest = nextParam.startsWith("/") && nextParam !== "/" ? nextParam : "/journal";

  // Wrong password → back to the login page with an error flag.
  if (password && submitted !== password) {
    const params = new URLSearchParams({ error: "1" });
    if (dest !== "/journal") params.set("next", dest);
    return new NextResponse(null, { status: 303, headers: { location: `/login?${params}` } });
  }

  // Correct (or no password configured) → seal the session and go to the dashboard.
  const res = new NextResponse(null, { status: 303, headers: { location: dest } });
  const session = await getIronSession<SessionData>(req, res, await sessionOptions());
  session.authenticated = true;
  await session.save();
  return res;
}
