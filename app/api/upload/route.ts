import { NextResponse } from "next/server";
import { explain, uploadFile } from "../../../lib/higgsfield";

export const runtime = "nodejs";

const TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024; // el navegador comprime antes de subir

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof Blob)) return NextResponse.json({ error: "No llegó ninguna foto" }, { status: 400 });
  if (!TYPES.has(file.type)) return NextResponse.json({ error: "Solo JPG, PNG o WebP" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "La foto pesa demasiado (máx. 5 MB)" }, { status: 400 });

  try {
    const url = await uploadFile(await file.arrayBuffer(), file.type);
    return NextResponse.json({ url });
  } catch (err) {
    const { message, status } = explain(err);
    console.error("upload:", status, message);
    return NextResponse.json({ error: `No se pudo subir la foto. ${message}` }, { status });
  }
}
