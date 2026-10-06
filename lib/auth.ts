// Sesión mínima por código de acceso. Funciona en middleware (Edge) y en rutas Node.
export const SESSION_COOKIE = "studio_session";

async function hmac(message: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Token de sesión derivado del código: si cambias el código, se cierran todas las sesiones. */
export async function sessionToken(): Promise<string | null> {
  const code = process.env.APP_ACCESS_CODE;
  const secret = process.env.SESSION_SECRET;
  if (!code || !secret) return null;
  return hmac(`access:${code}`, secret);
}

export async function isValidSession(value: string | undefined): Promise<boolean> {
  if (!value) return false;
  const expected = await sessionToken();
  if (!expected || expected.length !== value.length) return false;
  let diff = 0;
  for (let i = 0; i < value.length; i++) diff |= value.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

export function accessEnabled(): boolean {
  return Boolean(process.env.APP_ACCESS_CODE && process.env.SESSION_SECRET);
}
