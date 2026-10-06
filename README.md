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
| `PRICE_DISCOUNT` | Descuento de tu cuenta en Higgsfield, en % (15 por defecto) |

## Publicar en Vercel

1. Sube el repo a GitHub (el `.gitignore` ya excluye `.env.local`).
2. Importa el repo en Vercel o Netlify y añade las variables de entorno.
3. Comparte la URL y el código de acceso.

## Cómo se calcula el precio

- Tokens = `ceil(alto × ancho × segundos × 24 / 1024)`
- Precio de lista: $0.0214 por cada 1.000 tokens en 480p y 720p, $0.0234 en 1080p ($0.206/s en 480p 16:9).
- Sobre eso se aplica `PRICE_DISCOUNT`: con un 15 % salen $0.175/s en 480p, igual que "Your current price" en la tabla de precios de Higgsfield.

En 16:9 el precio es exacto. En otros formatos Higgsfield no publica las dimensiones, así que se muestra una estimación con "≈" y el coste real se recalcula con las dimensiones del vídeo al terminar.

El historial y el gasto se guardan en el navegador de cada persona.
