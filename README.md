# Plano

Web para generar vídeos con Seedance 2.5 (Higgsfield) entre amigos. Muestra el precio exacto de cada vídeo antes de generarlo.

## Arrancar en local

```bash
cp .env.example .env.local   # y rellena los valores
npm install
npm run dev                  # http://localhost:3000
```

## Variables de entorno (solo servidor)

| Variable | Para qué |
| --- | --- |
| `HF_CREDENTIALS` | Credencial de Higgsfield, `key-id:key-secret` |
| `APP_ACCESS_CODE` | Código que compartes con tus colegas. Cambiarlo cierra todas las sesiones |
| `SESSION_SECRET` | Cadena aleatoria larga para firmar la sesión |
| `MAX_DURATION` | Duración máxima por vídeo (4–30 s) |

## Publicar en Vercel

1. Sube el repo a GitHub (el `.gitignore` ya excluye `.env.local`).
2. Importa el repo en Vercel y añade las cuatro variables en *Settings → Environment Variables*.
3. Comparte la URL y el código de acceso.

## Cómo se calcula el precio

Tarifa oficial de la API, antes de descuentos:

- Tokens = `ceil(alto × ancho × segundos × 24 / 1024)`
- $0.0214 por cada 1.000 tokens en 480p y 720p, $0.0234 en 1080p.

En 16:9 el precio es exacto (cuadra con las tarifas publicadas: $0.2056/s en 480p, $0.4622/s en 720p y $1.1372/s en 1080p). En otros formatos Higgsfield no publica las dimensiones, así que se muestra una estimación con "≈" y el coste real se recalcula con las dimensiones del vídeo al terminar.

El historial y el gasto se guardan en el navegador de cada persona.
