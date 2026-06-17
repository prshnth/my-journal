import { getIronSession } from "iron-session";
import { NextResponse, type NextRequest } from "next/server";
import { sessionOptions, type SessionData } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Relative Location so it resolves against the public URL (works behind Caddy).
  const res = new NextResponse(null, { status: 303, headers: { location: "/login" } });
  const session = await getIronSession<SessionData>(req, res, await sessionOptions());
  session.destroy();
  return res;
}
