import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, accessEnabled, isValidSession } from "./lib/auth";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === "/api/login") return NextResponse.next();

  // Sin código configurado no se abre la puerta: la web gastaría tus créditos.
  if (!accessEnabled()) {
    return new NextResponse("Configura APP_ACCESS_CODE y SESSION_SECRET en el servidor.", { status: 503 });
  }

  const ok = await isValidSession(req.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === "/acceso") {
    // Si ya tiene sesión, directo al estudio.
    if (ok) {
      const url = req.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (ok) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/acceso";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
