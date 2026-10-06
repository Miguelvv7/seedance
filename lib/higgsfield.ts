import "server-only";
import { config, higgsfield } from "@higgsfield/client/v2";

export const MODEL = "bytedance/seedance-2.5/text-to-video";
const API_BASE = "https://api.higgsfield.ai";

let configured = false;

function credentials(): string {
  const value = process.env.HF_CREDENTIALS;
  if (!value) throw new Error("HF_CREDENTIALS no está configurada en el servidor.");
  return value;
}

export function client() {
  if (!configured) {
    config({ credentials: credentials() });
    configured = true;
  }
  return higgsfield;
}

export type RequestStatus = "queued" | "in_progress" | "completed" | "failed" | "nsfw" | "canceled";

export interface StatusResult {
  status: RequestStatus | string;
  videoUrl: string | null;
}

/** Consulta el estado de una petición (el SDK solo lo expone dentro de subscribe con polling). */
export async function getStatus(requestId: string): Promise<StatusResult> {
  const res = await fetch(`${API_BASE}/requests/${encodeURIComponent(requestId)}/status`, {
    headers: { Authorization: `Key ${credentials()}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const err = new Error(`Higgsfield respondió ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  const data = (await res.json()) as { status: string; video?: { url?: string } };
  const status = data.status === "cancelled" ? "canceled" : data.status;
  return { status, videoUrl: data.video?.url ?? null };
}
