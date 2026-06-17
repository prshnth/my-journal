import { getIronSession } from "iron-session";
import { NextResponse, type NextRequest } from "next/server";
import { dashboardPassword, sessionOptions, type SessionData } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const password = dashboardPassword();
  const submitted = String(form.get("password") ?? "");
  const nextParam = String(form.get("next") ?? "");
  const dest = nextParam.startsWith("/") && nextParam !== "/" ? nextParam : "/journal";

  // Wrong password → back to the login page with an error flag.
  if (password && submitted !== password) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("error", "1");
    if (dest !== "/journal") url.searchParams.set("next", dest);
    return NextResponse.redirect(url, 303);
  }

  // Correct (or no password configured) → seal the session and go to the dashboard.
  const url = req.nextUrl.clone();
  url.pathname = dest;
  url.search = "";
  const res = NextResponse.redirect(url, 303);
  const session = await getIronSession<SessionData>(req, res, await sessionOptions());
  session.authenticated = true;
  await session.save();
  return res;
}
