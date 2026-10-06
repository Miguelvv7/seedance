import { NextResponse } from "next/server";
import { SESSION_COOKIE, sessionToken } from "../../../lib/auth";

export async function POST(req: Request) {
  const { code } = (await req.json().catch(() => ({}))) as { code?: string };
  const expected = process.env.APP_ACCESS_CODE;

  // Pequeña pausa para frenar intentos por fuerza bruta.
  await new Promise((r) => setTimeout(r, 400));

  if (!expected || typeof code !== "string" || code.trim() !== expected) {
    return NextResponse.json({ error: "Código incorrecto" }, { status: 401 });
  }

  const token = await sessionToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token!, {
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
