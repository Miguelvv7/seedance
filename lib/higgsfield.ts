import "server-only";

// HF_API_BASE solo se usa para pruebas locales contra un simulador.
const API_BASE = process.env.HF_API_BASE || "https://api.higgsfield.ai";

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

/** Código de error del almacenamiento (S3/GCS devuelven XML con <Code>…</Code>). */
async function storageError(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  const code = /<Code>([^<]+)<\/Code>/i.exec(body)?.[1];
  return `${res.status}${code ? ` ${code}` : ""}`;
}

/** PUT a un enlace firmado. Sin credenciales: romperían la firma. */
async function putSigned(url: string, bytes: ArrayBuffer, headers: Record<string, string>): Promise<Response> {
  return fetch(url, { method: "PUT", body: bytes, headers, signal: AbortSignal.timeout(30_000) });
}

/** Cabeceras que el enlace firmado exige (S3: X-Amz-SignedHeaders, GCS: X-Goog-SignedHeaders). */
function signedHeadersOf(url: string): string[] {
  try {
    const q = new URL(url).searchParams;
    const raw = q.get("X-Amz-SignedHeaders") ?? q.get("x-amz-signedheaders") ?? q.get("X-Goog-SignedHeaders") ?? "";
    return raw.split(";").map((h) => h.trim().toLowerCase()).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Combinaciones de cabeceras a probar con el enlace firmado.
 * Si la firma incluye content-type, hay que mandar exactamente el tipo que se firmó;
 * si no lo incluye, lo más seguro es no mandar ninguno.
 */
function headerVariants(signed: string[], requested: string, fromSlot?: string): Record<string, string>[] {
  const types = [...new Set([fromSlot, requested, "application/octet-stream", "binary/octet-stream"].filter(Boolean) as string[])];
  const acl = signed.includes("x-amz-acl") ? [{ "x-amz-acl": "public-read" }, { "x-amz-acl": "private" }] : [{}];
  const out: Record<string, string>[] = [];
  const withType = signed.length === 0 || signed.includes("content-type");
  for (const a of acl) {
    if (withType) for (const t of types) out.push({ "Content-Type": t, ...a });
    out.push({ ...a });
  }
  return out;
}

/**
 * Sube un archivo al CDN de Higgsfield y devuelve su URL pública.
 * Lee qué cabeceras van firmadas en el enlace y prueba solo las combinaciones que encajan.
 * Si la cuenta tiene la API de agentes, usa como último recurso su subida con confirmación.
 */
export async function uploadFile(buffer: ArrayBuffer, contentType: string): Promise<string> {
  const tried: string[] = [];

  try {
    const slot = await api<{ upload_url: string; public_url: string; content_type?: string; headers?: Record<string, string> }>(
      "/files/generate-upload-url",
      { method: "POST", body: JSON.stringify({ content_type: contentType }) },
    );
    // Si Higgsfield indica cabeceras exactas, van primero.
    if (slot.headers && typeof slot.headers === "object") {
      const put = await putSigned(slot.upload_url, buffer, slot.headers);
      if (put.ok) return slot.public_url;
      tried.push(`cabeceras de Higgsfield: ${await storageError(put)}`);
    }
    const signed = signedHeadersOf(slot.upload_url);
    let host = "";
    try {
      host = new URL(slot.upload_url).host;
    } catch {}
    let last = "";
    for (const h of headerVariants(signed, contentType, slot.content_type)) {
      const put = await putSigned(slot.upload_url, buffer, h);
      if (put.ok) return slot.public_url;
      last = await storageError(put);
      if (put.status !== 403 && put.status !== 400) break; // otro tipo de fallo: no tiene sentido seguir probando
    }
    tried.push(`enlace firmado (${host}, firma: ${signed.join(";") || "sin lista"}): ${last}`);
  } catch (err) {
    if (err instanceof HiggsfieldHttpError && err.status === 401) throw err;
    tried.push(`enlace: ${err instanceof Error ? err.message : "error"}`);
  }

  try {
    const ext = contentType.endsWith("png") ? "png" : contentType.endsWith("webp") ? "webp" : "jpeg";
    const slot = await api<{ id: string; content_type: string; upload_url: string; url: string }>("/v1/agent/media", {
      method: "POST",
      body: JSON.stringify({ extension: ext, type: "image" }),
    });
    const put = await putSigned(slot.upload_url, buffer, { "Content-Type": slot.content_type });
    if (!put.ok) tried.push(`medios: ${await storageError(put)}`);
    else {
      const ok = await api<{ status: string }>(`/v1/agent/media/${encodeURIComponent(slot.id)}/confirm`, {
        method: "POST",
        body: JSON.stringify({ type: "image" }),
      });
      if (ok.status === "uploaded") return slot.url;
      tried.push(`medios: sin confirmar (${ok.status})`);
    }
  } catch (err) {
    const m = err instanceof Error ? err.message : "error";
    tried.push(/agent_api_access_denied/.test(m) ? "medios: tu cuenta no tiene la API de agentes" : `medios: ${m}`);
  }

  console.error("upload intentos:", tried.join(" | "));
  throw new HiggsfieldHttpError(`La subida falló (${tried.join(" · ")})`, 502);
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
