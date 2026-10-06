# Plano

Estudio web para crear vídeos e imágenes con los modelos de la API de Higgsfield, pensado para usarlo con amigos. Diseño estilo Apple, modo claro y oscuro, adaptado a móvil.

## Qué hace

- **Vídeo**: texto → vídeo, foto → vídeo, primer y último fotograma, y referencias (varias fotos o personajes en una escena).
- **Imagen**: crear desde texto y editar a partir de tus fotos.
- **Modelos**: Seedance 2.5 y 2.0, Kling 3.0 (Standard, Pro, Turbo, 4K), Kling O3, Kling 2.6 y 2.5 Turbo, Wan 3.0 y Prime, Wan 2.7 y 2.6, HappyHorse 1.1, MiniMax H3, Hailuo 2.3, LTX 2.5, PixVerse V6, Soul 2.0, Soul Cinema, Grok Imagine, Qwen Image 3, Ideogram 4.0, Recraft V4.1 y Z-Image. El catálogo completo está en `lib/catalog.ts`.
- **Personajes**: con nombre y fotos, reutilizables en cualquier vídeo. Opcionalmente se entrena un **Soul ID** para usarlos en Soul 2.0 y Soul Cinema.
- **Fotos**: se comprimen en el navegador y se suben al CDN de Higgsfield desde el servidor.
- **Precio** antes de generar y gasto acumulado por dispositivo.

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
| `MAX_DURATION` | Duración máxima por vídeo (4–30 s) para controlar el gasto |
| `PRICE_DISCOUNT` | Descuento de tu cuenta en Higgsfield, en % (0 por defecto) |
| `MAX_PER_HOUR` | Generaciones máximas por persona y hora (30 por defecto) |

## Publicar

1. Sube el repo a GitHub (el `.gitignore` ya excluye `.env.local`).
2. Impórtalo en Netlify o Vercel y añade las variables de entorno.
3. Comparte la URL y el código de acceso.

## Precios

- **Exacto**: Seedance 2.5 publica su fórmula: tokens = `ceil(alto × ancho × segundos × 24 / 1024)`, a $0.0214 por cada 1.000 tokens en 480p y 720p y $0.0234 en 1080p. En 16:9 el precio mostrado es exacto.
- **Desde**: para el resto, Higgsfield solo publica en texto el precio mínimo por segundo o por imagen. La web lo muestra como "desde" porque el precio final sube con la calidad, el sonido o el modo.
- **Sin precio**: modelos cuyo precio no aparece publicado.

## Errores

La web llama a la API directamente (`lib/higgsfield.ts`) y muestra el motivo real que devuelve Higgsfield. El SDK oficial traduce cualquier 403 como "sin créditos", lo que confunde otros errores.

## Protección

- Acceso con código: tras 8 códigos incorrectos en 15 minutos, esa conexión queda bloqueada un rato.
- Freno de gasto: `MAX_PER_HOUR` generaciones por persona y hora. Las peticiones rechazadas no cuentan. También hay un límite para subir fotos (120/h) y para entrenar personajes (5/h).
- Los límites viven en la memoria de cada instancia del servidor: frenan abusos y clics repetidos, pero no son un tope global exacto.
- El servidor valida cada petición contra el catálogo antes de enviarla a Higgsfield: solo pasan parámetros y valores permitidos.
- Cabeceras de seguridad (sin iframes, sin rastreo de referencias, HSTS).
