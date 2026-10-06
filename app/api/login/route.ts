import { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionToken } from "../../../lib/auth";
import { clientIp, hit, peek, waitText } from "../../../lib/ratelimit";

export const runtime = "nodejs";

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function POST(req: Request) {
  // Máximo 8 códigos incorrectos cada 15 minutos por IP.
  const key = `login:${clientIp(req)}`;
  const wait = peek(key, 8);
  if (wait) return NextResponse.json({ error: `Demasiados intentos. Espera ${waitText(wait)}.` }, { status: 429 });

  const body = (await req.json().catch(() => null)) as { code?: unknown } | null;
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  const expected = process.env.APP_ACCESS_CODE?.trim();

  // Pausa para que probar códigos a lo bruto sea lento.
  await new Promise((r) => setTimeout(r, 400));

  if (!expected || !code || !safeEqual(code, expected)) {
    hit(key, 8, 15 * 60 * 1000);
    return NextResponse.json({ error: "Código incorrecto" }, { status: 401 });
  }

  const token = await sessionToken();
  if (!token) return NextResponse.json({ error: "El servidor no tiene configurado el acceso" }, { status: 503 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
