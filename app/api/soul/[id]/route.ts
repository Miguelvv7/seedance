import { NextResponse } from "next/server";
import { getSoulId } from "../../../../lib/higgsfield";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{32,40}$/i.test(id)) return NextResponse.json({ error: "Id no válido" }, { status: 400 });
  try {
    const s = await getSoulId(id);
    return NextResponse.json({ status: s.status, thumbnail: s.thumbnail_url ?? null, reason: s.fail_reason ?? null });
  } catch {
    return NextResponse.json({ status: "unknown" });
  }
}
