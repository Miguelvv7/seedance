import { endpointOf, estimate, findWorkflow, SOUL_REFERENCE_MODELS, type Estimate, type Workflow } from "./catalog";

export interface GenerateRequest {
  model: string;
  prompt?: string;
  params?: Record<string, unknown>;
  image?: string;
  endImage?: string;
  images?: string[];
  soulId?: string;
}

export interface Built {
  workflow: Workflow;
  endpoint: string;
  input: Record<string, unknown>;
  estimate: Estimate;
}

const URL_RE = /^https:\/\/[^\s]{4,2000}$/;
const UUID_RE = /^[0-9a-f-]{32,40}$/i;

function isUrl(v: unknown): v is string {
  return typeof v === "string" && URL_RE.test(v);
}

/** Valida la petición contra el catálogo y construye el input exacto para Higgsfield. */
export function buildInput(body: GenerateRequest, maxDuration: number, discountFactor: number): Built | { error: string } {
  const w = findWorkflow(String(body.model ?? ""));
  if (!w) return { error: "Modelo no disponible" };

  const input: Record<string, unknown> = { ...(w.fixed ?? {}) };
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const max = w.promptMax ?? 2000;
  if (w.promptRequired && !prompt) return { error: "Escribe una descripción" };
  if (prompt.length > max) return { error: `La descripción admite hasta ${max} caracteres` };
  if (prompt) input.prompt = prompt;

  const params = body.params && typeof body.params === "object" && !Array.isArray(body.params) ? body.params : {};
  for (const f of w.fields) {
    let v = params[f.key];
    if (v === undefined || v === null || v === "") {
      if ("default" in f && f.default !== undefined && f.default !== "") v = f.default;
      else continue;
    }
    switch (f.type) {
      case "enum": {
        const opt = f.options.find((o) => String(o) === String(v));
        if (opt === undefined) return { error: `${f.label}: valor no válido` };
        if (opt === "") continue;
        v = opt;
        break;
      }
      case "int": {
        const n = Number(v);
        if (!Number.isInteger(n) || n < f.min || n > f.max) return { error: `${f.label}: entre ${f.min} y ${f.max}` };
        v = n;
        break;
      }
      case "number": {
        const n = Number(v);
        if (!Number.isFinite(n) || n < f.min || n > f.max) return { error: `${f.label}: entre ${f.min} y ${f.max}` };
        v = n;
        break;
      }
      case "bool":
        v = v === true || v === "true";
        break;
      case "switch":
        v = v === f.on || v === true ? f.on : f.off;
        break;
      case "text": {
        const s = String(v).trim();
        if (!s) continue;
        if (s.length > f.maxLength) return { error: `${f.label}: demasiado largo` };
        v = s;
        break;
      }
    }
    input[f.key] = v;
  }

  // Límite de duración que pone el dueño de la web para controlar el gasto.
  if (w.durationKey && typeof input[w.durationKey] === "number" && (input[w.durationKey] as number) > maxDuration) {
    return { error: `La duración máxima permitida aquí es ${maxDuration} s` };
  }

  const m = w.media;
  if (m?.image) {
    if (isUrl(body.image)) input[m.image.key] = body.image;
    else if (m.image.required) return { error: "Falta la foto" };
  }
  if (m?.endImage) {
    if (isUrl(body.endImage)) input[m.endImage.key] = body.endImage;
    else if (m.endImage.required) return { error: "Falta la foto final" };
  }
  if (m?.images) {
    const list = Array.isArray(body.images) ? body.images.filter(isUrl) : [];
    if (Array.isArray(body.images) && list.length !== body.images.length) return { error: "Alguna foto no es válida; vuelve a subirla" };
    if (list.length > m.images.max) return { error: `Máximo ${m.images.max} fotos` };
    if (m.images.required && list.length < (m.images.min ?? 1)) return { error: "Añade al menos una foto o personaje" };
    if (list.length) input[m.images.key] = list;
  }

  if (body.soulId !== undefined && body.soulId !== null && body.soulId !== "") {
    if (!SOUL_REFERENCE_MODELS.has(w.id) || typeof body.soulId !== "string" || !UUID_RE.test(body.soulId)) return { error: "Este modelo no admite personajes Soul ID" };
    input.custom_reference_id = body.soulId;
  }

  return { workflow: w, endpoint: endpointOf(w), input, estimate: estimate(w, input, discountFactor) };
}
