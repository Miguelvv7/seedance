import { NextResponse } from "next/server";
import { createSoulId, explain } from "../../../lib/higgsfield";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { name?: string; images?: string[] } | null;
  const name = typeof body?.name === "string" ? body.name.trim().slice(0, 100) : "";
  const images = Array.isArray(body?.images) ? body!.images.filter((u) => typeof u === "string" && /^https:\/\//.test(u)) : [];
  if (!name) return NextResponse.json({ error: "Ponle nombre al personaje" }, { status: 400 });
  if (images.length < 1 || images.length > 100) return NextResponse.json({ error: "Entre 1 y 100 fotos" }, { status: 400 });

  try {
    const soul = await createSoulId(name, images);
    return NextResponse.json({ id: soul.id, status: soul.status });
  } catch (err) {
    const { message, status } = explain(err);
    console.error("soul:", status, message);
    return NextResponse.json({ error: message }, { status });
  }
}
