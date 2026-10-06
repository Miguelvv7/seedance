import { NextResponse } from "next/server";
import { explain, uploadFile } from "../../../lib/higgsfield";
import { clientIp, hit, peek, waitText } from "../../../lib/ratelimit";

export const runtime = "nodejs";

const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024; // el navegador comprime antes de subir

export async function POST(req: Request) {
  const key = `up:${clientIp(req)}`;
  const wait = peek(key, 120);
  if (wait) return NextResponse.json({ error: `Demasiadas fotos seguidas. Espera ${waitText(wait)}.` }, { status: 429 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof Blob)) return NextResponse.json({ error: "No llegó ninguna foto" }, { status: 400 });
  if (!TYPES.has(file.type)) return NextResponse.json({ error: "Solo JPG, PNG o WebP" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "La foto pesa demasiado (máx. 5 MB)" }, { status: 400 });

  hit(key, 120, 60 * 60 * 1000);
  try {
    const url = await uploadFile(await file.arrayBuffer(), file.type);
    return NextResponse.json({ url });
  } catch (err) {
    const { message, status } = explain(err);
    console.error("upload:", status, message);
    // El detalle técnico ayuda a diagnosticar; la frase principal es para la persona.
    const detail = err instanceof Error && /La subida falló/.test(err.message) ? ` Detalle: ${err.message}` : ` ${message}`;
    return NextResponse.json({ error: `No se pudo subir la foto.${detail}` }, { status });
  }
}
