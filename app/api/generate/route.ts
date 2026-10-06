import { NextResponse } from "next/server";
import { explain, submit } from "../../../lib/higgsfield";
import { discountFactor, serverDiscount } from "../../../lib/pricing";
import { buildInput, type GenerateRequest } from "../../../lib/validate";

export const runtime = "nodejs";

const maxDuration = () => Math.min(30, Math.max(4, Number(process.env.MAX_DURATION) || 15));

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as GenerateRequest | null;
  if (!body) return NextResponse.json({ error: "Petición no válida" }, { status: 400 });

  const built = buildInput(body, maxDuration(), discountFactor(serverDiscount()));
  if ("error" in built) return NextResponse.json({ error: built.error }, { status: 400 });

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
