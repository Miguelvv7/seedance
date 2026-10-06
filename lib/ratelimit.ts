// Límite de peticiones en memoria por IP.
// En Netlify/Vercel cada instancia del servidor tiene su propia memoria, así que no es un
// límite global exacto, pero corta los abusos y los clics repetidos sin base de datos.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export function clientIp(req: Request): string {
  const h = req.headers;
  return (
    h.get("x-nf-client-connection-ip") ??
    h.get("x-real-ip") ??
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "local"
  );
}

/** Devuelve los segundos de espera si se supera el límite, o 0 si se permite. */
export function hit(key: string, limit: number, windowMs: number): number {
  const now = Date.now();
  if (buckets.size > 5000) for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return 0;
  }
  if (b.count >= limit) return Math.ceil((b.resetAt - now) / 1000);
  b.count++;
  return 0;
}

/** Consulta sin sumar: segundos de espera si ya se agotó el cupo, o 0. */
export function peek(key: string, limit: number): number {
  const b = buckets.get(key);
  const now = Date.now();
  if (!b || b.resetAt <= now || b.count < limit) return 0;
  return Math.ceil((b.resetAt - now) / 1000);
}

export function waitText(seconds: number): string {
  return seconds >= 60 ? `${Math.ceil(seconds / 60)} min` : `${seconds} s`;
}
