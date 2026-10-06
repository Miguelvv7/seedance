import { NextResponse } from "next/server";
import {
  AuthenticationError,
  NotEnoughCreditsError,
  ValidationError,
  BadInputError,
} from "@higgsfield/client/v2";
import { client, MODEL } from "../../../lib/higgsfield";
import { ASPECT_RATIOS, RESOLUTIONS, quote, type AspectRatio, type Resolution } from "../../../lib/pricing";

export const runtime = "nodejs";

const MIN_DURATION = 4;
const maxDuration = () => Math.min(30, Math.max(MIN_DURATION, Number(process.env.MAX_DURATION) || 15));

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Petición no válida" }, { status: 400 });

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const duration = Number(body.duration);
  const resolution = body.resolution as Resolution;
  const aspect = body.aspect_ratio as AspectRatio;
  const audio = body.generate_audio !== false;

  if (!prompt) return NextResponse.json({ error: "Escribe una descripción" }, { status: 400 });
  if (prompt.length > 2000) return NextResponse.json({ error: "Máximo 2000 caracteres" }, { status: 400 });
  if (!Number.isInteger(duration) || duration < MIN_DURATION || duration > maxDuration())
    return NextResponse.json({ error: `Duración entre ${MIN_DURATION} y ${maxDuration()} s` }, { status: 400 });
  if (!RESOLUTIONS.includes(resolution)) return NextResponse.json({ error: "Resolución no válida" }, { status: 400 });
  if (!ASPECT_RATIOS.includes(aspect)) return NextResponse.json({ error: "Formato no válido" }, { status: 400 });

  try {
    const res = await client().subscribe(MODEL, {
      input: {
        prompt,
        duration,
        resolution,
        aspect_ratio: aspect,
        output_format: "mp4",
        generate_audio: audio,
      },
      withPolling: false,
    });
    if (!res.request_id) throw new Error("Higgsfield no devolvió un identificador");
    return NextResponse.json({ id: res.request_id, status: res.status, quote: quote(resolution, aspect, duration) });
  } catch (err) {
    if (err instanceof NotEnoughCreditsError)
      return NextResponse.json({ error: "No quedan créditos en la cuenta de Higgsfield." }, { status: 402 });
    if (err instanceof AuthenticationError)
      return NextResponse.json({ error: "La credencial del servidor no es válida." }, { status: 500 });
    if (err instanceof ValidationError || err instanceof BadInputError)
      return NextResponse.json({ error: "Higgsfield rechazó los parámetros." }, { status: 400 });
    console.error("generate:", err instanceof Error ? err.message : "error desconocido");
    return NextResponse.json({ error: "No se pudo iniciar la generación." }, { status: 502 });
  }
}

export function GET() {
  return NextResponse.json({ maxDuration: maxDuration(), minDuration: MIN_DURATION });
}
