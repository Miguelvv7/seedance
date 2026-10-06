import { NextResponse } from "next/server";
import { getStatus } from "../../../../lib/higgsfield";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[\w-]{6,80}$/.test(id)) return NextResponse.json({ error: "Id no válido" }, { status: 400 });

  try {
    const result = await getStatus(id);
    return NextResponse.json(result);
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 404) return NextResponse.json({ error: "Generación no encontrada" }, { status: 404 });
    // Errores de red o 5xx son transitorios: el cliente sigue consultando.
    if (!status || status >= 500) return NextResponse.json({ status: "in_progress", videoUrl: null, transient: true });
    return NextResponse.json({ error: "No se pudo consultar el estado" }, { status: 502 });
  }
}
