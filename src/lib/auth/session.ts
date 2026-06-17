import type { SessionOptions } from "iron-session";

export interface SessionData {
  authenticated?: boolean;
}

export const SESSION_COOKIE = "mj_session";

// Computed keys keep the bundler from inlining these at build time — the values come
// from the container environment at runtime, so the gate and the login always agree.
const PASS_KEY = "DASHBOARD_PASSWORD";
const SECRET_KEY = "SESSION_SECRET";

/** The shared dashboard password (the login secret). Empty string = auth disabled. */
export function dashboardPassword(): string {
  return process.env[PASS_KEY] ?? "";
}

/** A 64-char sealing key from SESSION_SECRET (preferred) or the dashboard password. */
async function sealingKey(): Promise<string> {
  const raw = process.env[SECRET_KEY] || process.env[PASS_KEY] || "dev-insecure-secret";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`mj:${raw}`));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sessionOptions(): Promise<SessionOptions> {
  return {
    password: await sealingKey(),
    cookieName: SESSION_COOKIE,
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    },
  };
}
