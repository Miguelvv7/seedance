"use client";

const MAX_SIDE = 2048;

/** Reduce la foto en el navegador (máx. 2048 px, JPEG) para subirla rápido y sin pasar del límite. */
async function compress(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("Eso no es una foto");
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) throw new Error("No se pudo leer la foto. Prueba con JPG o PNG.");
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Tu navegador no puede procesar la foto");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
  if (!blob) throw new Error("No se pudo preparar la foto");
  return blob;
}

/** Comprime y sube una foto. Devuelve la URL pública en el CDN de Higgsfield. */
export async function uploadPhoto(file: File): Promise<string> {
  const blob = await compress(file);
  const form = new FormData();
  form.append("file", blob, "foto.jpg");
  const res = await fetch("/api/upload", { method: "POST", body: form }).catch(() => null);
  if (!res) throw new Error("Sin conexión. Revisa tu red.");
  if (res.status === 401) {
    window.location.href = "/acceso";
    throw new Error("Sesión caducada");
  }
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !data.url) throw new Error(data.error ?? "No se pudo subir la foto");
  return data.url;
}
