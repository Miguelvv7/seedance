import { NextResponse } from "next/server";
import { explain, submit } from "../../../lib/higgsfield";
import { discountFactor, serverDiscount } from "../../../lib/pricing";
import { buildInput, type GenerateRequest } from "../../../lib/validate";
import { clientIp, hit, peek, waitText } from "../../../lib/ratelimit";

export const runtime = "nodejs";

const maxDuration = () => Math.min(30, Math.max(4, Number(process.env.MAX_DURATION) || 15));
const perHour = () => Math.max(1, Number(process.env.MAX_PER_HOUR) || 30);

export async function POST(req: Request) {
  // Freno de gasto: generaciones por hora y por persona (IP). Solo cuentan las que llegan a Higgsfield.
  const key = `gen:${clientIp(req)}`;
  const limited = () =>
    NextResponse.json({ error: `Has llegado al límite de ${perHour()} generaciones por hora. Vuelve en ${waitText(peek(key, perHour()))}.` }, { status: 429 });
  if (peek(key, perHour())) return limited();

  const body = (await req.json().catch(() => null)) as GenerateRequest | null;
  if (!body) return NextResponse.json({ error: "Petición no válida" }, { status: 400 });

  const built = buildInput(body, maxDuration(), discountFactor(serverDiscount()));
  if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 });

  if (hit(key, perHour(), 60 * 60 * 1000)) return limited();
  try {
    const res = await submit(built.endpoint, built.input);
    if (!res.request_id) throw new Error("Higgsfield no devolvió un identificador");
    return NextResponse.json({ id: res.request_id, status: res.status, estimate: built.estimate });
  } catch (err) {
    const { message, status } = explain(err);
    console.error("generate:", status, message);
    return NextResponse.json({ error: message }, { status });
  }
}
