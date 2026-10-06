// Precios de Seedance 2.5 Text to Video en la API de Higgsfield.
// Fuente: https://open.higgsfield.ai/models/bytedance/seedance-2.5/text-to-video
// Tokens facturables = ceil(alto × ancho × segundos × 24 / 1024)
// La tarifa por token publicada es el precio de lista. Higgsfield aplica después
// el descuento de cada cuenta (15 % al completar "Get started", hasta 30 % si
// Seedance es uno de tus 3 modelos con descuento máximo). Se configura con
// PRICE_DISCOUNT (porcentaje) en el servidor.

export type Resolution = "480p" | "720p" | "1080p";
export type AspectRatio = "16:9" | "4:3" | "1:1" | "3:4" | "9:16" | "21:9";

export const RESOLUTIONS: Resolution[] = ["480p", "720p", "1080p"];
export const ASPECT_RATIOS: AspectRatio[] = ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"];

/** Dólares por cada 1.000 tokens de vídeo. */
export const USD_PER_1K_TOKENS: Record<Resolution, number> = {
  "480p": 0.0214,
  "720p": 0.0214,
  "1080p": 0.0234,
};

/** Dimensiones 16:9 que reproducen exactamente las tarifas publicadas por segundo. */
const BASE_16_9: Record<Resolution, { width: number; height: number }> = {
  "480p": { width: 854, height: 480 }, // lista $0.2056/s
  "720p": { width: 1280, height: 720 }, // lista $0.4622/s
  "1080p": { width: 1920, height: 1080 }, // lista $1.1372/s
};

export function billableTokens(width: number, height: number, seconds: number): number {
  return Math.ceil((height * width * seconds * 24) / 1024);
}

/** Descuento por defecto de la cuenta, en %. */
export const DEFAULT_DISCOUNT = 0;

/** Convierte un porcentaje de descuento en multiplicador (0–75 %). */
export function discountFactor(percent: number): number {
  const p = Number.isFinite(percent) ? Math.min(75, Math.max(0, percent)) : DEFAULT_DISCOUNT;
  return 1 - p / 100;
}

export function costUSD(tokens: number, resolution: Resolution, factor = discountFactor(DEFAULT_DISCOUNT)): number {
  return (tokens / 1000) * USD_PER_1K_TOKENS[resolution] * factor;
}

export interface Quote {
  tokens: number;
  usd: number;
  /** true si las dimensiones están publicadas (16:9); false si es una estimación. */
  exact: boolean;
  width: number;
  height: number;
}

/**
 * Presupuesto antes de generar.
 * 16:9 usa las dimensiones que cuadran con la tarifa oficial (exacto).
 * Para otros formatos Higgsfield no publica las dimensiones, así que se
 * estima con el mismo número de píxeles; el coste real se recalcula al terminar.
 */
export function quote(
  resolution: Resolution,
  aspect: AspectRatio,
  seconds: number,
  factor = discountFactor(DEFAULT_DISCOUNT),
): Quote {
  const base = BASE_16_9[resolution];
  let width = base.width;
  let height = base.height;
  const exact = aspect === "16:9";
  if (!exact) {
    const [a, b] = aspect.split(":").map(Number);
    const area = base.width * base.height;
    height = Math.round(Math.sqrt((area * b) / a));
    width = Math.round((height * a) / b);
  }
  const tokens = billableTokens(width, height, seconds);
  return { tokens, usd: costUSD(tokens, resolution, factor), exact, width, height };
}

export function formatUSD(value: number): string {
  return `$${value.toFixed(4)}`;
}

export function perSecondUSD(resolution: Resolution, factor = discountFactor(DEFAULT_DISCOUNT)): number {
  const b = BASE_16_9[resolution];
  return costUSD(billableTokens(b.width, b.height, 1), resolution, factor);
}

/** Descuento configurado en el servidor (PRICE_DISCOUNT, en %). */
export function serverDiscount(): number {
  const raw = process.env.PRICE_DISCOUNT;
  const n = raw === undefined || raw === "" ? DEFAULT_DISCOUNT : Number(raw);
  return Number.isFinite(n) ? Math.min(75, Math.max(0, n)) : DEFAULT_DISCOUNT;
}
