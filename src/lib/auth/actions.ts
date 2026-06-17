"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "./session";

export async function logout(): Promise<void> {
  const session = await getIronSession<SessionData>(await cookies(), await sessionOptions());
  session.destroy();
  redirect("/login");
}
