import "server-only";

const API_BASE = "https://api.higgsfield.ai";

function credentials(): string {
  const value = process.env.HF_CREDENTIALS;
  if (!value) throw new Error("HF_CREDENTIALS no está configurada en el servidor.");
  return value;
}

/** Cabeceras válidas para la API v2 y para los endpoints v1 (subidas, Soul ID). */
function authHeaders(): Record<string, string> {
  const cred = credentials();
  const [key, secret] = cred.split(":");
  return {
    Authorization: `Key ${cred}`,
    "hf-api-key": key ?? "",
    "hf-secret": secret ?? "",
  };
}

export class HiggsfieldHttpError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** Saca el motivo legible de un error de Higgsfield (o del proxy que haya delante). */
function detailOf(body: string): string {
  try {
    const j = JSON.parse(body) as { detail?: unknown; message?: unknown; error?: unknown };
    const d = j.detail ?? j.message ?? j.error;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) return d.map((x) => (typeof x === "object" && x && "msg" in x ? String((x as { msg: unknown }).msg) : String(x))).join("; ");
  } catch {}
  return body.slice(0, 200);
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { Accept: "application/json", "Content-Type": "application/json", ...authHeaders(), ...(init.headers ?? {}) },
    cache: "no-store",
    signal: init.signal ?? AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    const detail = detailOf(await res.text().catch(() => ""));
    throw new HiggsfieldHttpError(detail || `Higgsfield respondió ${res.status}`, res.status);
  }
  return (await res.json()) as T;
}

/** Lanza una generación sin esperar (equivale a subscribe con withPolling: false). */
export async function submit(endpoint: string, input: Record<string, unknown>): Promise<{ request_id: string; status: string }> {
  return api(`/${endpoint.replace(/^\//, "")}`, { method: "POST", body: JSON.stringify(input) });
}

/** Traduce un error de Higgsfield a un mensaje claro para la web. */
export function explain(err: unknown): { message: string; status: number } {
  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError"))
    return { message: "Higgsfield tardó demasiado en responder. Inténtalo de nuevo.", status: 504 };
  if (!(err instanceof HiggsfieldHttpError)) return { message: "No se pudo conectar con Higgsfield.", status: 502 };
  const d = err.message;
  if (/allowlist|egress/i.test(d)) return { message: "El servidor no tiene salida a internet hacia Higgsfield.", status: 502 };
  if (err.status === 401) return { message: "La credencial de Higgsfield del servidor no es válida.", status: 500 };
  if (err.status === 402 || /credit|balance|insufficient|funds/i.test(d))
    return { message: "No quedan créditos en la cuenta de Higgsfield.", status: 402 };
  if (err.status === 400 || err.status === 422) return { message: `Higgsfield rechazó los parámetros: ${d}`, status: 400 };
  if (err.status === 403) return { message: `Higgsfield denegó la petición: ${d}`, status: 403 };
  if (err.status === 429) return { message: "Higgsfield está recibiendo demasiadas peticiones. Espera un momento.", status: 429 };
  return { message: `Higgsfield respondió ${err.status}: ${d}`, status: 502 };
}

export interface StatusResult {
  status: string;
  videoUrl: string | null;
  images: string[];
}

/** Estado de una generación (vídeo o imagen). */
export async function getStatus(requestId: string): Promise<StatusResult> {
  const data = await api<{ status: string; video?: { url?: string }; images?: { url?: string }[] }>(
    `/requests/${encodeURIComponent(requestId)}/status`,
  );
  const status = data.status === "cancelled" ? "canceled" : data.status;
  return {
    status,
    videoUrl: data.video?.url ?? null,
    images: (data.images ?? []).map((i) => i.url).filter((u): u is string => Boolean(u)),
  };
}

/** Sube un archivo al CDN de Higgsfield y devuelve su URL pública. */
export async function uploadFile(bytes: ArrayBuffer, contentType: string): Promise<string> {
  const slot = await api<{ upload_url: string; public_url: string }>("/files/generate-upload-url", {
    method: "POST",
    body: JSON.stringify({ content_type: contentType }),
  });
  const put = await fetch(slot.upload_url, {
    method: "PUT",
    body: bytes,
    headers: { "Content-Type": contentType },
    signal: AbortSignal.timeout(30_000),
  });
  if (!put.ok) throw new HiggsfieldHttpError(`La subida falló (${put.status})`, put.status);
  return slot.public_url;
}

export interface SoulId {
  id: string;
  name: string;
  status: string;
  thumbnail_url?: string | null;
  fail_reason?: string | null;
}

/** Entrena un personaje (Soul ID) para los modelos Soul. */
export async function createSoulId(name: string, imageUrls: string[]): Promise<SoulId> {
  return api<SoulId>("/v1/custom-references", {
    method: "POST",
    body: JSON.stringify({
      name,
      model_version: "v2",
      input_images: imageUrls.map((url) => ({ type: "image_url", image_url: url })),
    }),
  });
}

export async function getSoulId(id: string): Promise<SoulId> {
  return api<SoulId>(`/v1/custom-references/${encodeURIComponent(id)}`);
}
