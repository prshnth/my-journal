// Signed session token, safe in both the Edge (middleware) and Node (server action)
// runtimes — uses only Web Crypto + base64, no Node-specific APIs. The secret is the
// dashboard password, so rotating the password invalidates existing sessions.

const encoder = new TextEncoder();

export const SESSION_COOKIE = "mj_session";

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return new Uint8Array(sig);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** `base64url(JSON payload).base64url(hmac)` — payload carries an absolute expiry. */
export async function createSessionToken(secret: string, ttlMs: number): Promise<string> {
  const payload = base64url(encoder.encode(JSON.stringify({ exp: Date.now() + ttlMs })));
  const sig = base64url(await hmac(secret, payload));
  return `${payload}.${sig}`;
}

export async function verifySessionToken(
  secret: string,
  token: string | undefined | null,
): Promise<boolean> {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = await hmac(secret, payload);
  if (!timingSafeEqual(fromBase64url(sig), expected)) return false;
  try {
    const { exp } = JSON.parse(new TextDecoder().decode(fromBase64url(payload)));
    return typeof exp === "number" && exp > Date.now();
  } catch {
    return false;
  }
}
