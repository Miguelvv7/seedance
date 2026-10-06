// Catálogo de modelos de Higgsfield (API v2).
// Parámetros sacados de las páginas "API reference" de open.higgsfield.ai (octubre 2026).
// Cada workflow se envía con higgsfield.subscribe(endpoint, { input }).

import { billableTokens, type AspectRatio, type Resolution } from "./pricing";

export type Kind = "video" | "image";
export type Mode =
  | "t2v" // texto → vídeo
  | "i2v" // foto → vídeo
  | "flf" // primer y último fotograma
  | "ref" // referencias → vídeo
  | "t2i" // texto → imagen
  | "edit"; // fotos → imagen

export const MODE_LABEL: Record<Mode, string> = {
  t2v: "Texto",
  i2v: "Foto",
  flf: "Inicio y fin",
  ref: "Referencias",
  t2i: "Crear",
  edit: "Editar",
};

export const MODE_HINT: Record<Mode, string> = {
  t2v: "Describe la escena y el modelo la crea desde cero.",
  i2v: "Sube una foto y el modelo la anima siguiendo tu descripción.",
  flf: "Sube cómo empieza y cómo acaba: el modelo crea el movimiento entre las dos.",
  ref: "Añade fotos o personajes y el modelo los mete en la misma escena.",
  t2i: "Describe la imagen que quieres.",
  edit: "Sube una o varias fotos y describe qué cambiar.",
};

export const KIND_MODES: Record<Kind, Mode[]> = {
  video: ["t2v", "i2v", "flf", "ref"],
  image: ["t2i", "edit"],
};

export type Field =
  | { key: string; label: string; type: "enum"; options: (string | number)[]; default?: string | number; labels?: Record<string, string>; advanced?: boolean }
  | { key: string; label: string; type: "int"; min: number; max: number; default?: number; unit?: string; advanced?: boolean }
  | { key: string; label: string; type: "number"; min: number; max: number; step: number; default?: number; advanced?: boolean; hint?: string }
  | { key: string; label: string; type: "bool"; default?: boolean; advanced?: boolean; hint?: string }
  | { key: string; label: string; type: "switch"; on: string; off: string; default?: string; advanced?: boolean } // "on"/"off" como texto
  | { key: string; label: string; type: "text"; maxLength: number; advanced?: boolean; placeholder?: string };

export type Price =
  | { type: "seedance25" } // fórmula oficial por tokens
  | { type: "perSecond"; usd: number; exact: false; floorOnly?: boolean } // precio "desde" publicado
  | { type: "perImage"; usd: number; exact: false }
  | { type: "unknown" };

export interface Media {
  /** Foto inicial (string). */
  image?: { key: string; required: boolean; label?: string };
  /** Foto final (string). */
  endImage?: { key: string; required: boolean; label?: string };
  /** Lista de fotos de referencia (array de strings). */
  images?: { key: string; required: boolean; max: number; min?: number };
}

export interface Workflow {
  id: string; // endpoint
  family: string;
  name: string;
  kind: Kind;
  mode: Mode;
  promptRequired: boolean;
  promptMax?: number;
  media?: Media;
  fields: Field[];
  /** Campo de duración (para el precio). */
  durationKey?: string;
  price: Price;
  blurb: string;
  tags: string[];
  /** Valores fijos que se envían siempre. */
  fixed?: Record<string, unknown>;
}

// ---------- Campos reutilizables ----------
const AR6: AspectRatio[] = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"];
const ar = (options: string[], def: string): Field => ({ key: "aspect_ratio", label: "Formato", type: "enum", options, default: def });
const dur = (min: number, max: number, def = 5): Field => ({ key: "duration", label: "Duración", type: "int", min, max, default: def, unit: "s" });
const durOpts = (options: number[], def: number): Field => ({ key: "duration", label: "Duración", type: "enum", options, default: def });
const res = (options: string[], def: string): Field => ({ key: "resolution", label: "Calidad", type: "enum", options, default: def });
const audio = (key = "generate_audio", def = true): Field => ({ key, label: "Sonido", type: "bool", default: def });
const sound = (def = "on"): Field => ({ key: "sound", label: "Sonido", type: "switch", on: "on", off: "off", default: def });
const cfg: Field = { key: "cfg_scale", label: "Fidelidad al texto", type: "number", min: 0, max: 1, step: 0.05, default: 0.5, advanced: true, hint: "Más alto: sigue el texto al pie de la letra." };
const seed = (max = 2147483647, min = 0): Field => ({ key: "seed", label: "Semilla", type: "int", min, max, advanced: true });
const negative: Field = { key: "negative_prompt", label: "Evitar", type: "text", maxLength: 2000, advanced: true, placeholder: "Lo que no quieres que aparezca" };
const thinking: Field = { key: "enable_thinking", label: "Pensamiento profundo", type: "bool", default: false, advanced: true };
const extend: Field = { key: "prompt_extend", label: "Mejorar descripción", type: "bool", default: false, advanced: true };

const ps = (usd: number): Price => ({ type: "perSecond", usd, exact: false });
/** Variante más cara de una familia: solo sabemos que cuesta más que el mínimo de la familia. */
const psFloor = (usd: number): Price => ({ type: "perSecond", usd, exact: false, floorOnly: true });
const pi = (usd: number): Price => ({ type: "perImage", usd, exact: false });

// ---------- Vídeo ----------
const seedance25Fields = (withAspect: boolean): Field[] => [
  ...(withAspect ? [ar(AR6, "16:9")] : []),
  dur(4, 30),
  res(["480p", "720p", "1080p"], "720p"),
  audio(),
];

const kling3Fields: Field[] = [ar(["16:9", "9:16", "1:1"], "16:9"), dur(3, 15), sound(), cfg];
const kling3I2V: Field[] = [dur(3, 15), sound(), cfg];

const wan3Fields = (withAspect = true): Field[] => [
  ...(withAspect ? [ar(["adaptive", "16:9", "9:16", "1:1", "4:3", "3:4"], "adaptive")] : []),
  dur(2, 30),
  res(["480p", "720p", "1080p"], "1080p"),
  audio(),
  thinking,
  seed(),
];

export const WORKFLOWS: Workflow[] = [
  // Seedance 2.5
  {
    id: "bytedance/seedance-2.5/text-to-video",
    family: "Seedance 2.5",
    name: "Seedance 2.5",
    kind: "video",
    mode: "t2v",
    promptRequired: true,
    fields: seedance25Fields(true),
    durationKey: "duration",
    price: { type: "seedance25" },
    blurb: "El más avanzado de ByteDance: cine, movimiento natural y sonido. Hasta 30 s.",
    tags: ["Top", "Sonido", "1080p", "30 s"],
  },
  {
    id: "bytedance/seedance-2.5/image-to-video",
    family: "Seedance 2.5",
    name: "Seedance 2.5",
    kind: "video",
    mode: "i2v",
    promptRequired: false,
    media: { image: { key: "image_url", required: true }, endImage: { key: "end_image_url", required: false } },
    fields: seedance25Fields(false),
    durationKey: "duration",
    price: { type: "seedance25" },
    blurb: "Anima tu foto con la calidad de Seedance 2.5. Admite foto final opcional.",
    tags: ["Top", "Sonido", "1080p"],
  },
  {
    id: "bytedance/seedance-2.5/image-to-video#flf",
    family: "Seedance 2.5",
    name: "Seedance 2.5",
    kind: "video",
    mode: "flf",
    promptRequired: false,
    media: { image: { key: "image_url", required: true }, endImage: { key: "end_image_url", required: true } },
    fields: seedance25Fields(false),
    durationKey: "duration",
    price: { type: "seedance25" },
    blurb: "Transición cinematográfica entre tu foto inicial y la final.",
    tags: ["Top", "Sonido"],
  },
  {
    id: "bytedance/seedance-2.5/reference-to-video",
    family: "Seedance 2.5",
    name: "Seedance 2.5",
    kind: "video",
    mode: "ref",
    promptRequired: true,
    media: { images: { key: "image_urls", required: true, max: 9, min: 1 } },
    fields: seedance25Fields(true),
    durationKey: "duration",
    price: { type: "seedance25" },
    blurb: "Mete varios personajes y objetos en una escena manteniendo su aspecto.",
    tags: ["Top", "Personajes", "Sonido"],
  },
  // Seedance 2.0
  {
    id: "bytedance/seedance-2.0/text-to-video",
    family: "Seedance 2.0",
    name: "Seedance 2.0",
    kind: "video",
    mode: "t2v",
    promptRequired: true,
    fields: [ar(AR6, "16:9"), dur(4, 15), res(["480p", "720p", "1080p", "4k"], "720p"), audio()],
    durationKey: "duration",
    price: ps(0.141),
    blurb: "Generación anterior de Seedance, con opción 4K.",
    tags: ["Sonido", "4K"],
  },
  {
    id: "bytedance/seedance-2.0/image-to-video",
    family: "Seedance 2.0",
    name: "Seedance 2.0",
    kind: "video",
    mode: "i2v",
    promptRequired: false,
    media: { image: { key: "image_url", required: true }, endImage: { key: "end_image_url", required: false } },
    fields: [dur(4, 15), res(["480p", "720p", "1080p", "4k"], "720p"), audio()],
    durationKey: "duration",
    price: ps(0.141),
    blurb: "Anima tu foto hasta en 4K.",
    tags: ["Sonido", "4K"],
  },
  {
    id: "bytedance/seedance-2.0/image-to-video#flf",
    family: "Seedance 2.0",
    name: "Seedance 2.0",
    kind: "video",
    mode: "flf",
    promptRequired: false,
    media: { image: { key: "image_url", required: true }, endImage: { key: "end_image_url", required: true } },
    fields: [dur(4, 15), res(["480p", "720p", "1080p", "4k"], "720p"), audio()],
    durationKey: "duration",
    price: ps(0.141),
    blurb: "Transición entre dos fotos, hasta 4K.",
    tags: ["4K"],
  },
  {
    id: "bytedance/seedance-2.0/reference-to-video",
    family: "Seedance 2.0",
    name: "Seedance 2.0",
    kind: "video",
    mode: "ref",
    promptRequired: true,
    media: { images: { key: "image_urls", required: true, max: 9, min: 1 } },
    fields: [ar(AR6, "16:9"), dur(4, 15), res(["480p", "720p", "1080p", "4k"], "720p"), audio()],
    durationKey: "duration",
    price: ps(0.141),
    blurb: "Varios personajes en escena, hasta 4K.",
    tags: ["Personajes", "4K"],
  },
  // Kling 3.0
  {
    id: "kling-video/v3.0/std/text-to-video",
    family: "Kling 3.0",
    name: "Kling 3.0 Standard",
    kind: "video",
    mode: "t2v",
    promptRequired: true,
    promptMax: 2500,
    fields: kling3Fields,
    durationKey: "duration",
    price: ps(0.084),
    blurb: "Muy buen movimiento a buen precio. Hasta 15 s con sonido.",
    tags: ["Sonido", "Buen precio"],
  },
  {
    id: "kling-video/v3.0/pro/text-to-video",
    family: "Kling 3.0",
    name: "Kling 3.0 Pro",
    kind: "video",
    mode: "t2v",
    promptRequired: true,
    promptMax: 2500,
    fields: kling3Fields,
    durationKey: "duration",
    price: psFloor(0.084),
    blurb: "Más detalle y estabilidad que Standard.",
    tags: ["Sonido"],
  },
  {
    id: "kling-video/v3.0/4k/text-to-video",
    family: "Kling 3.0",
    name: "Kling 3.0 4K",
    kind: "video",
    mode: "t2v",
    promptRequired: true,
    promptMax: 2500,
    fields: kling3Fields,
    durationKey: "duration",
    price: psFloor(0.084),
    blurb: "La máxima resolución de Kling.",
    tags: ["4K", "Sonido"],
  },
  {
    id: "kling-video/v3.0-turbo/text-to-video",
    family: "Kling 3.0",
    name: "Kling 3.0 Turbo",
    kind: "video",
    mode: "t2v",
    promptRequired: true,
    fields: [ar(["16:9", "9:16", "1:1"], "16:9"), dur(3, 15), res(["720p", "1080p"], "720p")],
    durationKey: "duration",
    price: ps(0.084),
    blurb: "La versión rápida de Kling 3.0.",
    tags: ["Rápido"],
  },
  {
    id: "kling-video/v3.0/std/image-to-video",
    family: "Kling 3.0",
    name: "Kling 3.0 Standard",
    kind: "video",
    mode: "i2v",
    promptRequired: false,
    media: { image: { key: "image_url", required: true }, endImage: { key: "last_image_url", required: false } },
    fields: kling3I2V,
    durationKey: "duration",
    price: ps(0.084),
    blurb: "Anima tu foto con sonido. Foto final opcional.",
    tags: ["Sonido", "Buen precio"],
  },
  {
    id: "kling-video/v3.0/pro/image-to-video",
    family: "Kling 3.0",
    name: "Kling 3.0 Pro",
    kind: "video",
    mode: "i2v",
    promptRequired: false,
    media: { image: { key: "image_url", required: true }, endImage: { key: "last_image_url", required: false } },
    fields: kling3I2V,
    durationKey: "duration",
    price: psFloor(0.084),
    blurb: "Animación de foto con más detalle.",
    tags: ["Sonido"],
  },
  {
    id: "kling-video/v3.0/4k/image-to-video",
    family: "Kling 3.0",
    name: "Kling 3.0 4K",
    kind: "video",
    mode: "i2v",
    promptRequired: false,
    media: { image: { key: "image_url", required: true }, endImage: { key: "last_image_url", required: false } },
    fields: kling3I2V,
    durationKey: "duration",
    price: psFloor(0.084),
    blurb: "Anima tu foto en 4K.",
    tags: ["4K", "Sonido"],
  },
  {
    id: "kling-video/v3.0-turbo/image-to-video",
    family: "Kling 3.0",
    name: "Kling 3.0 Turbo",
    kind: "video",
    mode: "i2v",
    promptRequired: true,
    media: { image: { key: "image_url", required: true } },
    fields: [dur(3, 15), res(["720p", "1080p"], "720p")],
    durationKey: "duration",
    price: ps(0.084),
    blurb: "Animación rápida de foto.",
    tags: ["Rápido"],
  },
  {
    id: "kling-video/v3.0/pro/image-to-video#flf",
    family: "Kling 3.0",
    name: "Kling 3.0 Pro",
    kind: "video",
    mode: "flf",
    promptRequired: false,
    media: { image: { key: "image_url", required: true }, endImage: { key: "last_image_url", required: true } },
    fields: kling3I2V,
    durationKey: "duration",
    price: psFloor(0.084),
    blurb: "Transición entre dos fotos con Kling 3.0.",
    tags: ["Sonido"],
  },
  // Kling O3
  {
    id: "kling-video/o3/image-reference",
    family: "Kling O3",
    name: "Kling O3",
    kind: "video",
    mode: "ref",
    promptRequired: true,
    media: { images: { key: "image_urls", required: true, max: 7, min: 1 } },
    fields: [
      { key: "mode", label: "Calidad", type: "enum", options: ["std", "pro", "4k"], default: "std", labels: { std: "Standard", pro: "Pro", "4k": "4K" } },
      ar(["16:9", "9:16", "1:1"], "16:9"),
      dur(3, 15),
      sound("off"),
    ],
    durationKey: "duration",
    price: ps(0.084),
    blurb: "Personajes y objetos de tus fotos en una escena, con calidad hasta 4K.",
    tags: ["Personajes", "4K"],
  },
  {
    id: "kling-video/o3/first-last-frame",
    family: "Kling O3",
    name: "Kling O3",
    kind: "video",
    mode: "flf",
    promptRequired: false,
    media: { image: { key: "first_frame_url", required: true }, endImage: { key: "last_frame_url", required: true } },
    fields: [
      { key: "mode", label: "Calidad", type: "enum", options: ["std", "pro", "4k"], default: "pro", labels: { std: "Standard", pro: "Pro", "4k": "4K" } },
      ar(["16:9", "9:16", "1:1"], "16:9"),
      dur(3, 15),
      sound("off"),
    ],
    durationKey: "duration",
    price: ps(0.084),
    blurb: "Transiciones precisas entre fotograma inicial y final.",
    tags: ["4K"],
  },
  // Kling 2.6 / 2.5
  {
    id: "kling-video/v2.6/pro/text-to-video",
    family: "Kling 2.6",
    name: "Kling 2.6 Pro",
    kind: "video",
    mode: "t2v",
    promptRequired: true,
    fields: [ar(["16:9", "9:16", "1:1"], "16:9"), durOpts([5, 10], 5), sound(), cfg],
    durationKey: "duration",
    price: ps(0.07),
    blurb: "Kling con sonido, a 5 o 10 s.",
    tags: ["Sonido"],
  },
  {
    id: "kling-video/v2.6/pro/image-to-video",
    family: "Kling 2.6",
    name: "Kling 2.6 Pro",
    kind: "video",
    mode: "i2v",
    promptRequired: true,
    media: { image: { key: "image_url", required: true } },
    fields: [ar(["16:9", "9:16", "1:1"], "16:9"), durOpts([5, 10], 5), sound(), cfg],
    durationKey: "duration",
    price: ps(0.07),
    blurb: "Anima tu foto con sonido.",
    tags: ["Sonido"],
  },
  {
    id: "kling-video/v2.5-turbo/pro/text-to-video",
    family: "Kling 2.5 Turbo",
    name: "Kling 2.5 Turbo Pro",
    kind: "video",
    mode: "t2v",
    promptRequired: true,
    fields: [durOpts([5, 10], 5), cfg, negative],
    durationKey: "duration",
    price: ps(0.07),
    blurb: "Rápido y fiable, sin sonido.",
    tags: ["Rápido"],
  },
  {
    id: "kling-video/v2.5-turbo/pro/image-to-video",
    family: "Kling 2.5 Turbo",
    name: "Kling 2.5 Turbo Pro",
    kind: "video",
    mode: "i2v",
    promptRequired: true,
    media: { image: { key: "image_url", required: true } },
    fields: [durOpts([5, 10], 5), cfg, negative],
    durationKey: "duration",
    price: ps(0.07),
    blurb: "Animación rápida de foto.",
    tags: ["Rápido"],
  },
  {
    id: "kling-video/v2.5-turbo/standard/image-to-video",
    family: "Kling 2.5 Turbo",
    name: "Kling 2.5 Turbo Standard",
    kind: "video",
    mode: "i2v",
    promptRequired: true,
    media: { image: { key: "image_url", required: true } },
    fields: [durOpts([5, 10], 5), cfg, negative],
    durationKey: "duration",
    price: ps(0.042),
    blurb: "La opción más barata de Kling para animar fotos.",
    tags: ["Barato"],
  },
  // Wan
  {
    id: "alibaba/wan-3.0/text-to-video",
    family: "Wan 3.0",
    name: "Wan 3.0",
    kind: "video",
    mode: "t2v",
    promptRequired: true,
    fields: wan3Fields(),
    durationKey: "duration",
    price: ps(0.05),
    blurb: "Alibaba. Hasta 30 s con sonido a muy buen precio.",
    tags: ["Sonido", "30 s", "Barato"],
  },
  {
    id: "alibaba/wan-3.0/image-to-video",
    family: "Wan 3.0",
    name: "Wan 3.0",
    kind: "video",
    mode: "i2v",
    promptRequired: true,
    media: { image: { key: "image_url", required: true }, endImage: { key: "end_image_url", required: false } },
    fields: wan3Fields(),
    durationKey: "duration",
    price: ps(0.05),
    blurb: "Anima tu foto hasta 30 s.",
    tags: ["Sonido", "Barato"],
  },
  {
    id: "alibaba/wan-3.0/image-to-video#flf",
    family: "Wan 3.0",
    name: "Wan 3.0",
    kind: "video",
    mode: "flf",
    promptRequired: true,
    media: { image: { key: "image_url", required: true }, endImage: { key: "end_image_url", required: true } },
    fields: wan3Fields(),
    durationKey: "duration",
    price: ps(0.05),
    blurb: "Transición entre dos fotos, barata.",
    tags: ["Barato"],
  },
  {
    id: "alibaba/wan-3.0/reference-to-video",
    family: "Wan 3.0",
    name: "Wan 3.0",
    kind: "video",
    mode: "ref",
    promptRequired: true,
    media: { images: { key: "image_urls", required: true, max: 9, min: 1 } },
    fields: wan3Fields(),
    durationKey: "duration",
    price: ps(0.05),
    blurb: "Varios personajes en escena, el más barato.",
    tags: ["Personajes", "Barato"],
  },
  {
    id: "alibaba/wan-3.0-prime/text-to-video",
    family: "Wan 3.0 Prime",
    name: "Wan 3.0 Prime",
    kind: "video",
    mode: "t2v",
    promptRequired: true,
    fields: wan3Fields(),
    durationKey: "duration",
    price: ps(0.068),
    blurb: "La versión de más calidad de Wan 3.0.",
    tags: ["Sonido", "30 s"],
  },
  {
    id: "alibaba/wan-3.0-prime/image-to-video",
    family: "Wan 3.0 Prime",
    name: "Wan 3.0 Prime",
    kind: "video",
    mode: "i2v",
    promptRequired: true,
    media: { image: { key: "image_url", required: true }, endImage: { key: "end_image_url", required: false } },
    fields: wan3Fields(),
    durationKey: "duration",
    price: ps(0.068),
    blurb: "Anima tu foto con Wan Prime.",
    tags: ["Sonido"],
  },
  {
    id: "alibaba/wan-3.0-prime/reference-to-video",
    family: "Wan 3.0 Prime",
    name: "Wan 3.0 Prime",
    kind: "video",
    mode: "ref",
    promptRequired: true,
    media: { images: { key: "image_urls", required: true, max: 9, min: 1 } },
    fields: wan3Fields(),
    durationKey: "duration",
    price: ps(0.068),
    blurb: "Personajes en escena con Wan Prime.",
    tags: ["Personajes"],
  },
  {
    id: "wan/v2.7/text-to-video",
    family: "Wan 2.7",
    name: "Wan 2.7",
    kind: "video",
    mode: "t2v",
    promptRequired: true,
    fields: [ar(["16:9", "9:16", "1:1", "4:3", "3:4"], "16:9"), dur(2, 15), res(["720p", "1080p"], "720p"), extend, negative, seed(2147483646, 1)],
    durationKey: "duration",
    price: ps(0.1),
    blurb: "Wan 2.7 con texto negativo y mejora de descripción.",
    tags: ["1080p"],
  },
  {
    id: "wan/v2.7/image-to-video",
    family: "Wan 2.7",
    name: "Wan 2.7",
    kind: "video",
    mode: "i2v",
    promptRequired: false,
    media: { image: { key: "image_url", required: true }, endImage: { key: "end_image_url", required: false } },
    fields: [dur(2, 15), res(["720p", "1080p"], "720p"), extend, negative, seed(2147483646, 1)],
    durationKey: "duration",
    price: ps(0.1),
    blurb: "Anima tu foto con Wan 2.7.",
    tags: ["1080p"],
  },
  {
    id: "wan/v2.6/text-to-video",
    family: "Wan 2.6",
    name: "Wan 2.6",
    kind: "video",
    mode: "t2v",
    promptRequired: true,
    fields: [durOpts([5, 10, 15], 5), res(["720p", "1080p"], "720p"), { key: "multi_shots", label: "Varios planos", type: "bool", default: false }, extend],
    durationKey: "duration",
    price: ps(0.1),
    blurb: "Admite vídeos de varios planos.",
    tags: ["Multiplano"],
  },
  // HappyHorse
  {
    id: "alibaba/happy-horse/v1.1/text-to-video",
    family: "HappyHorse 1.1",
    name: "HappyHorse 1.1",
    kind: "video",
    mode: "t2v",
    promptRequired: true,
    fields: [ar(["16:9", "9:16", "1:1", "4:3", "3:4"], "16:9"), dur(3, 15), res(["720p", "1080p"], "1080p"), seed(2147483646, 1)],
    durationKey: "duration",
    price: ps(0.098),
    blurb: "Modelo de Alibaba en 1080p por defecto.",
    tags: ["1080p"],
  },
  {
    id: "alibaba/happy-horse/v1.1/image-to-video",
    family: "HappyHorse 1.1",
    name: "HappyHorse 1.1",
    kind: "video",
    mode: "i2v",
    promptRequired: false,
    media: { image: { key: "image_url", required: true } },
    fields: [dur(2, 15), res(["720p", "1080p"], "1080p"), seed(2147483646, 1)],
    durationKey: "duration",
    price: ps(0.14),
    blurb: "Anima tu foto en 1080p.",
    tags: ["1080p"],
  },
  {
    id: "alibaba/happy-horse/v1.1/reference-to-video",
    family: "HappyHorse 1.1",
    name: "HappyHorse 1.1",
    kind: "video",
    mode: "ref",
    promptRequired: true,
    media: { images: { key: "image_urls", required: true, max: 9, min: 1 } },
    fields: [dur(2, 15), res(["720p", "1080p"], "1080p"), seed(2147483646, 1)],
    durationKey: "duration",
    price: ps(0.14),
    blurb: "Personajes de tus fotos en 1080p.",
    tags: ["Personajes"],
  },
  // MiniMax
  {
    id: "minimax/h3/text-to-video",
    family: "MiniMax H3",
    name: "MiniMax H3",
    kind: "video",
    mode: "t2v",
    promptRequired: true,
    fields: [ar(["auto", "16:9", "9:16", "1:1", "4:3", "3:4", "21:9"], "auto"), dur(5, 15)],
    fixed: { resolution: "2K", aigc_watermark: false },
    durationKey: "duration",
    price: { type: "unknown" },
    blurb: "Vídeo en 2K de MiniMax.",
    tags: ["2K"],
  },
  {
    id: "minimax/h3/image-to-video",
    family: "MiniMax H3",
    name: "MiniMax H3",
    kind: "video",
    mode: "i2v",
    promptRequired: true,
    media: { image: { key: "image_url", required: true }, endImage: { key: "end_image_url", required: false } },
    fields: [ar(["auto", "16:9", "9:16", "1:1", "4:3", "3:4", "21:9"], "auto"), dur(5, 15)],
    fixed: { resolution: "2K", aigc_watermark: false },
    durationKey: "duration",
    price: { type: "unknown" },
    blurb: "Anima tu foto en 2K.",
    tags: ["2K"],
  },
  {
    id: "minimax/hailuo-2.3/standard/text-to-video",
    family: "Hailuo 2.3",
    name: "Hailuo 2.3",
    kind: "video",
    mode: "t2v",
    promptRequired: true,
    fields: [durOpts([6, 10], 6), { key: "prompt_optimizer", label: "Mejorar descripción", type: "bool", default: true, advanced: true }],
    durationKey: "duration",
    price: ps(0.0467),
    blurb: "Muy barato y con buena física.",
    tags: ["Barato"],
  },
  // LTX
  {
    id: "lightricks/ltx-2.5/text-to-video/fast",
    family: "LTX 2.5",
    name: "LTX 2.5 Fast",
    kind: "video",
    mode: "t2v",
    promptRequired: true,
    promptMax: 5000,
    fields: [
      ar(["16:9", "9:16"], "16:9"),
      durOpts([6, 8, 10], 6),
      res(["720p", "1080p", "2k", "4k"], "720p"),
      audio(),
      { key: "camera_movement", label: "Cámara", type: "enum", options: ["", "static", "dolly_in", "dolly_out", "dolly_left", "dolly_right", "jib_up", "jib_down", "focus_shift"], default: "", labels: { "": "Libre", static: "Fija", dolly_in: "Acercar", dolly_out: "Alejar", dolly_left: "Izquierda", dolly_right: "Derecha", jib_up: "Subir", jib_down: "Bajar", focus_shift: "Cambio de foco" } },
      { key: "fps", label: "FPS", type: "enum", options: [24, 25, 48, 50], default: 25, advanced: true },
    ],
    durationKey: "duration",
    price: ps(0.09),
    blurb: "Rápido, hasta 4K y con control de cámara.",
    tags: ["4K", "Cámara"],
  },
  {
    id: "lightricks/ltx-2.5/text-to-video/pro",
    family: "LTX 2.5",
    name: "LTX 2.5 Pro",
    kind: "video",
    mode: "t2v",
    promptRequired: true,
    promptMax: 5000,
    fields: [
      ar(["16:9", "9:16"], "16:9"),
      durOpts([6, 8, 10], 6),
      res(["720p", "1080p"], "720p"),
      audio(),
      { key: "camera_movement", label: "Cámara", type: "enum", options: ["", "static", "dolly_in", "dolly_out", "dolly_left", "dolly_right", "jib_up", "jib_down", "focus_shift"], default: "", labels: { "": "Libre", static: "Fija", dolly_in: "Acercar", dolly_out: "Alejar", dolly_left: "Izquierda", dolly_right: "Derecha", jib_up: "Subir", jib_down: "Bajar", focus_shift: "Cambio de foco" } },
      { key: "fps", label: "FPS", type: "enum", options: [24, 25, 50], default: 25, advanced: true },
    ],
    durationKey: "duration",
    price: { type: "unknown" },
    blurb: "LTX con más calidad y control de cámara.",
    tags: ["Cámara"],
  },
  // PixVerse
  {
    id: "pixverse/v6/text-to-video",
    family: "PixVerse V6",
    name: "PixVerse V6",
    kind: "video",
    mode: "t2v",
    promptRequired: true,
    promptMax: 5000,
    fields: [ar(["16:9", "9:16", "1:1", "4:3", "3:4"], "16:9"), dur(1, 15), res(["360p", "540p", "720p", "1080p"], "720p"), audio(), negative, seed()],
    durationKey: "duration",
    price: ps(0.0298),
    blurb: "El más barato de todos. Ideal para probar ideas.",
    tags: ["Más barato", "Sonido"],
  },

  // ---------- Imagen ----------
  {
    id: "higgsfield-ai/soul/v2/standard",
    family: "Soul",
    name: "Soul 2.0",
    kind: "image",
    mode: "t2i",
    promptRequired: true,
    fields: [
      ar(["9:16", "16:9", "4:3", "3:4", "1:1", "2:3", "3:2"], "3:4"),
      res(["720p", "1080p"], "1080p"),
      { key: "batch_size", label: "Imágenes", type: "enum", options: [1, 4], default: 1 },
      { key: "enhance_prompt", label: "Mejorar descripción", type: "bool", default: true, advanced: true },
      seed(1000000, 1),
    ],
    price: pi(0.0032),
    blurb: "El modelo de Higgsfield para moda y estética. Admite tus personajes (Soul ID).",
    tags: ["Personajes", "Moda"],
  },
  {
    id: "higgsfield-ai/soul/cinema",
    family: "Soul",
    name: "Soul Cinema",
    kind: "image",
    mode: "t2i",
    promptRequired: true,
    fields: [
      ar(["9:16", "16:9", "4:3", "3:4", "1:1", "2:3", "3:2"], "16:9"),
      res(["720p", "1080p"], "1080p"),
      { key: "batch_size", label: "Imágenes", type: "enum", options: [1, 4], default: 1 },
      { key: "enhance_prompt", label: "Mejorar descripción", type: "bool", default: false, advanced: true },
      seed(1000000, 1),
    ],
    price: { type: "unknown" },
    blurb: "Fotogramas de cine. Perfecto como primer fotograma de un vídeo.",
    tags: ["Personajes", "Cine"],
  },
  {
    id: "xai/grok-imagine-image-2.0",
    family: "Grok Imagine",
    name: "Grok Imagine 2.0",
    kind: "image",
    mode: "t2i",
    promptRequired: true,
    fields: [
      ar(["auto", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "2:1", "1:2"], "auto"),
      res(["1k", "2k"], "1k"),
      { key: "quality", label: "Calidad", type: "enum", options: ["low", "medium"], default: "medium", labels: { low: "Rápida", medium: "Normal" } },
    ],
    price: { type: "unknown" },
    blurb: "El generador de imágenes de xAI.",
    tags: ["2K"],
  },
  {
    id: "xai/grok-imagine-image-2.0#edit",
    family: "Grok Imagine",
    name: "Grok Imagine 2.0",
    kind: "image",
    mode: "edit",
    promptRequired: true,
    media: { images: { key: "image_urls", required: true, max: 4, min: 1 } },
    fields: [
      ar(["auto", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"], "auto"),
      res(["1k", "2k"], "1k"),
      { key: "quality", label: "Calidad", type: "enum", options: ["low", "medium"], default: "medium", labels: { low: "Rápida", medium: "Normal" } },
    ],
    price: { type: "unknown" },
    blurb: "Edita tus fotos o combínalas describiendo el cambio.",
    tags: ["Edición"],
  },
  {
    id: "alibaba/qwen-image-3/text-to-image",
    family: "Qwen Image 3",
    name: "Qwen Image 3",
    kind: "image",
    mode: "t2i",
    promptRequired: true,
    fields: [
      ar(["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9"], "1:1"),
      res(["1k", "2k"], "1k"),
      { key: "prompt_extend", label: "Mejorar descripción", type: "bool", default: true, advanced: true },
      { key: "enable_thinking", label: "Pensamiento profundo", type: "bool", default: true, advanced: true },
      negative,
      seed(),
    ],
    price: { type: "unknown" },
    blurb: "Muy bueno con texto dentro de la imagen.",
    tags: ["Texto"],
  },
  {
    id: "alibaba/qwen-image-3/edit",
    family: "Qwen Image 3",
    name: "Qwen Image 3",
    kind: "image",
    mode: "edit",
    promptRequired: true,
    media: { images: { key: "image_urls", required: true, max: 3, min: 1 } },
    fields: [
      ar(["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9"], "1:1"),
      res(["1k", "2k"], "1k"),
      { key: "prompt_extend", label: "Mejorar descripción", type: "bool", default: true, advanced: true },
      negative,
      seed(),
    ],
    price: { type: "unknown" },
    blurb: "Edita hasta 3 fotos a la vez con instrucciones.",
    tags: ["Edición"],
  },
  {
    id: "ideogram/v4.0",
    family: "Ideogram",
    name: "Ideogram 4.0",
    kind: "image",
    mode: "t2i",
    promptRequired: true,
    promptMax: 2048,
    fields: [
      ar(["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "4:5", "5:4"], "1:1"),
      { key: "rendering_speed", label: "Velocidad", type: "enum", options: ["TURBO", "DEFAULT", "QUALITY"], default: "DEFAULT", labels: { TURBO: "Turbo", DEFAULT: "Normal", QUALITY: "Calidad" } },
    ],
    price: pi(0.03),
    blurb: "El mejor para carteles, logos y tipografía.",
    tags: ["Texto", "Diseño"],
  },
  {
    id: "ideogram/v4.0#edit",
    family: "Ideogram",
    name: "Ideogram 4.0",
    kind: "image",
    mode: "edit",
    promptRequired: true,
    promptMax: 2048,
    media: { image: { key: "image_url", required: true, label: "Foto a editar" } },
    fields: [
      ar(["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "4:5", "5:4"], "1:1"),
      { key: "image_weight", label: "Parecido a tu foto", type: "int", min: 1, max: 100, default: 50 },
      { key: "rendering_speed", label: "Velocidad", type: "enum", options: ["TURBO", "DEFAULT", "QUALITY"], default: "DEFAULT", labels: { TURBO: "Turbo", DEFAULT: "Normal", QUALITY: "Calidad" } },
    ],
    price: pi(0.03),
    blurb: "Rehaz tu foto con otro estilo manteniendo la composición.",
    tags: ["Edición"],
  },
  {
    id: "recraft/v4.1/text-to-image",
    family: "Recraft",
    name: "Recraft V4.1",
    kind: "image",
    mode: "t2i",
    promptRequired: true,
    fields: [
      ar(["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "4:5", "5:4"], "1:1"),
      { key: "output_format", label: "Formato de archivo", type: "enum", options: ["jpg", "png", "webp"], default: "png", advanced: true },
    ],
    price: pi(0.035),
    blurb: "Ilustración y diseño gráfico limpio.",
    tags: ["Diseño"],
  },
  {
    id: "z-image/turbo",
    family: "Z-Image",
    name: "Z-Image Turbo",
    kind: "image",
    mode: "t2i",
    promptRequired: true,
    promptMax: 800,
    fields: [ar(["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9"], "1:1"), res(["1k", "2k"], "1k"), seed()],
    price: { type: "unknown" },
    blurb: "Imágenes muy rápidas.",
    tags: ["Rápido"],
  },
];

/** Los modelos Soul aceptan un Soul ID (personaje entrenado). */
export const SOUL_REFERENCE_MODELS = new Set(["higgsfield-ai/soul/v2/standard", "higgsfield-ai/soul/cinema"]);

export function findWorkflow(id: string): Workflow | undefined {
  return WORKFLOWS.find((w) => w.id === id);
}

/** Endpoint real (sin el sufijo #modo que usamos para separar variantes de UI). */
export function endpointOf(w: Workflow): string {
  return w.id.split("#")[0];
}

export function workflowsFor(mode: Mode): Workflow[] {
  return WORKFLOWS.filter((w) => w.mode === mode);
}

export function defaultsFor(w: Workflow): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of w.fields) if ("default" in f && f.default !== undefined) out[f.key] = f.default;
  return out;
}

// ---------- Precio ----------

export interface Estimate {
  usd: number | null;
  /** exact: fórmula oficial; from: precio mínimo publicado; unknown: sin precio publicado. */
  /** exact: fórmula oficial; from: precio mínimo publicado con los ajustes más baratos;
   *  atLeast: con estos ajustes cuesta más que la cifra (Higgsfield no publica cuánto); unknown: sin precio. */
  basis: "exact" | "from" | "atLeast" | "unknown";
  detail: string;
}

const SEEDANCE_BASE: Record<string, { w: number; h: number; rate: number }> = {
  "480p": { w: 854, h: 480, rate: 0.0214 },
  "720p": { w: 1280, h: 720, rate: 0.0214 },
  "1080p": { w: 1920, h: 1080, rate: 0.0234 },
};

export function estimate(w: Workflow, params: Record<string, unknown>, discountFactor = 1): Estimate {
  const p = { ...defaultsFor(w), ...params };
  const seconds = Number(w.durationKey ? p[w.durationKey] : 0) || 0;

  if (w.price.type === "seedance25") {
    const r = String(p.resolution ?? "720p");
    const base = SEEDANCE_BASE[r] ?? SEEDANCE_BASE["720p"];
    const aspect = String(p.aspect_ratio ?? "16:9");
    let width = base.w;
    let height = base.h;
    let exact = true;
    if (aspect !== "16:9") {
      // Higgsfield no publica las dimensiones de otros formatos: misma área.
      const [a, b] = aspect.split(":").map(Number);
      if (a && b) {
        height = Math.round(Math.sqrt((base.w * base.h * b) / a));
        width = Math.round((height * a) / b);
        exact = false;
      }
    }
    // En foto → vídeo el formato lo marca la foto: se calcula con 16:9.
    if (!w.fields.some((f) => f.key === "aspect_ratio")) exact = false;
    const tokens = billableTokens(width, height, seconds);
    const usd = (tokens / 1000) * base.rate * discountFactor;
    return {
      usd,
      basis: exact ? "exact" : "from",
      detail: `${tokens.toLocaleString("es-ES")} tokens`,
    };
  }
  if (w.price.type === "perSecond") {
    const above = w.price.floorOnly || aboveCheapest(w, p);
    return {
      usd: w.price.usd * seconds * discountFactor,
      basis: above ? "atLeast" : "from",
      detail: above ? `mínimo publicado: $${w.price.usd}/s` : `$${w.price.usd}/s con los ajustes más baratos`,
    };
  }
  if (w.price.type === "perImage") {
    const n = Number(p.batch_size ?? 1) || 1;
    const above = aboveCheapest(w, p);
    return {
      usd: w.price.usd * n * discountFactor,
      basis: above ? "atLeast" : "from",
      detail: above ? `mínimo publicado: $${w.price.usd}/imagen` : `$${w.price.usd}/imagen con los ajustes más baratos`,
    };
  }
  return { usd: null, basis: "unknown", detail: "Higgsfield no publica este precio" };
}

/** Ajustes que encarecen el vídeo o la imagen. La primera opción de cada uno es la más barata. */
const PRICE_KEYS = ["resolution", "mode", "quality", "rendering_speed"];
const CHEAPEST: Record<string, string> = { rendering_speed: "TURBO" };

/** ¿Algún ajuste de precio está por encima del más barato? */
function aboveCheapest(w: Workflow, p: Record<string, unknown>): boolean {
  return w.fields.some((f) => {
    if (f.type !== "enum" || !PRICE_KEYS.includes(f.key)) return false;
    const cheapest = CHEAPEST[f.key] ?? String(f.options[0]);
    return p[f.key] !== undefined && String(p[f.key]) !== cheapest;
  });
}

/** Para mostrar el formato de la pantalla. */
export function aspectOf(w: Workflow, params: Record<string, unknown>): string {
  const v = String({ ...defaultsFor(w), ...params }.aspect_ratio ?? "");
  return /^\d+:\d+$/.test(v) ? v : w.kind === "image" ? "1:1" : "16:9";
}

export type { Resolution, AspectRatio };
