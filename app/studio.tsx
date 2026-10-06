"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ASPECT_RATIOS,
  RESOLUTIONS,
  billableTokens,
  costUSD,
  formatUSD,
  quote,
  type AspectRatio,
  type Quote,
  type Resolution,
} from "../lib/pricing";

type Status = "queued" | "in_progress" | "completed" | "failed" | "nsfw" | "canceled" | "error";

interface Take {
  id: string;
  prompt: string;
  duration: number;
  resolution: Resolution;
  aspect: AspectRatio;
  audio: boolean;
  quote: Quote;
  status: Status;
  videoUrl: string | null;
  createdAt: number;
  actual?: { width: number; height: number; tokens: number; usd: number };
  message?: string;
}

type Theme = "system" | "light" | "dark";

const HISTORY_KEY = "plano-history";
const THEME_KEY = "plano-theme";
const POLL_MS = 4000;
const PENDING: Status[] = ["queued", "in_progress"];

const STATUS_COPY: Record<Status, string> = {
  queued: "En cola",
  in_progress: "Generando",
  completed: "Listo",
  failed: "Falló",
  nsfw: "Bloqueado por moderación",
  canceled: "Cancelado",
  error: "Error",
};

const FAILURE_COPY: Partial<Record<Status, string>> = {
  failed: "Higgsfield no pudo generar este vídeo. Cambia la descripción y vuelve a generarlo.",
  nsfw: "El filtro de contenido bloqueó esta descripción. Reescríbela y vuelve a generarla.",
  canceled: "La generación se canceló antes de terminar.",
};

const ASPECT_LABEL: Record<AspectRatio, string> = {
  "16:9": "Horizontal",
  "9:16": "Vertical",
  "1:1": "Cuadrado",
  "4:3": "Clásico",
  "3:4": "Retrato",
  "21:9": "Cine",
};

const IDEAS = [
  "Un faro al atardecer, la cámara se acerca despacio mientras las olas rompen contra las rocas",
  "Calle de Sevilla de noche con lluvia, reflejos de neón en los charcos, plano a ras de suelo",
  "Un astronauta camina por un campo de girasoles al amanecer, cámara en mano",
];

function loadHistory(): Take[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as Take[]) : [];
  } catch {
    return [];
  }
}

function saveHistory(takes: Take[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(takes.slice(0, 40)));
  } catch {}
}

function ratio(aspect: AspectRatio) {
  const [a, b] = aspect.split(":").map(Number);
  return a / b;
}

function elapsed(from: number, now: number) {
  const s = Math.max(0, Math.floor((now - from) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function Studio({ maxDuration }: { maxDuration: number }) {
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState(5);
  const [resolution, setResolution] = useState<Resolution>("720p");
  const [aspect, setAspect] = useState<AspectRatio>("16:9");
  const [audio, setAudio] = useState(true);

  const [takes, setTakes] = useState<Take[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>("system");
  const [now, setNow] = useState(() => Date.now());
  const [hydrated, setHydrated] = useState(false);

  const takesRef = useRef<Take[]>([]);
  takesRef.current = takes;
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = loadHistory();
    setTakes(h);
    setActiveId(h[0]?.id ?? null);
    try {
      const t = localStorage.getItem(THEME_KEY);
      if (t === "light" || t === "dark") setTheme(t);
    } catch {}
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveHistory(takes);
  }, [takes, hydrated]);

  function applyTheme(next: Theme) {
    setTheme(next);
    const root = document.documentElement;
    try {
      if (next === "system") {
        delete root.dataset.theme;
        localStorage.removeItem(THEME_KEY);
      } else {
        root.dataset.theme = next;
        localStorage.setItem(THEME_KEY, next);
      }
    } catch {}
  }

  const updateTake = useCallback((id: string, patch: Partial<Take>) => {
    setTakes((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  // Consulta el estado de todo lo pendiente (también tras recargar la página).
  const hasPending = takes.some((t) => PENDING.includes(t.status));
  useEffect(() => {
    if (!hasPending) return;
    let stop = false;
    const tick = async () => {
      const pending = takesRef.current.filter((t) => PENDING.includes(t.status));
      await Promise.all(
        pending.map(async (t) => {
          const res = await fetch(`/api/status/${encodeURIComponent(t.id)}`, { cache: "no-store" }).catch(() => null);
          if (!res) return;
          if (res.status === 401) {
            window.location.href = "/acceso";
            return;
          }
          const data = (await res.json().catch(() => null)) as { status?: string; videoUrl?: string | null; error?: string } | null;
          if (!data) return;
          if (!res.ok) {
            updateTake(t.id, { status: "error", message: data.error ?? "No se pudo consultar el estado." });
            return;
          }
          const s = (data.status ?? "in_progress") as Status;
          if (s === "completed" && !data.videoUrl) {
            updateTake(t.id, { status: "error", message: "Higgsfield terminó sin devolver el vídeo." });
          } else if (s in STATUS_COPY) {
            updateTake(t.id, { status: s, videoUrl: data.videoUrl ?? null });
          }
        }),
      );
    };
    tick();
    const poll = setInterval(() => !stop && tick(), POLL_MS);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stop = true;
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [hasPending, updateTake]);

  const price = useMemo(() => quote(resolution, aspect, duration), [resolution, aspect, duration]);
  const active = takes.find((t) => t.id === activeId) ?? null;
  const stageAspect = active ? active.aspect : aspect;
  const spent = takes.reduce((sum, t) => (t.status === "completed" ? sum + (t.actual?.usd ?? t.quote.usd) : sum), 0);

  async function generate(e?: React.FormEvent) {
    e?.preventDefault();
    const text = prompt.trim();
    if (!text || submitting) return;
    setSubmitting(true);
    setFormError(null);
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: text, duration, resolution, aspect_ratio: aspect, generate_audio: audio }),
    }).catch(() => null);
    setSubmitting(false);

    if (!res) return setFormError("Sin conexión. Revisa tu red e inténtalo otra vez.");
    if (res.status === 401) return void (window.location.href = "/acceso");
    const data = (await res.json().catch(() => ({}))) as { id?: string; status?: string; quote?: Quote; error?: string };
    if (!res.ok || !data.id) return setFormError(data.error ?? "No se pudo iniciar la generación.");

    const take: Take = {
      id: data.id,
      prompt: text,
      duration,
      resolution,
      aspect,
      audio,
      quote: data.quote ?? price,
      status: (data.status as Status) ?? "queued",
      videoUrl: null,
      createdAt: Date.now(),
    };
    setTakes((prev) => [take, ...prev]);
    setActiveId(take.id);
    setNow(Date.now());
    stageRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function reuse(t: Take) {
    setPrompt(t.prompt);
    setDuration(Math.min(t.duration, maxDuration));
    setResolution(t.resolution);
    setAspect(t.aspect);
    setAudio(t.audio);
    setActiveId(null);
    const el = document.getElementById("prompt");
    el?.focus();
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function onMetadata(t: Take, video: HTMLVideoElement) {
    if (t.actual || !video.videoWidth) return;
    const tokens = billableTokens(video.videoWidth, video.videoHeight, t.duration);
    updateTake(t.id, {
      actual: { width: video.videoWidth, height: video.videoHeight, tokens, usd: costUSD(tokens, t.resolution) },
    });
  }

  async function logout() {
    await fetch("/api/login", { method: "DELETE" }).catch(() => null);
    window.location.href = "/acceso";
  }

  const fill = `${((duration - 4) / Math.max(1, maxDuration - 4)) * 100}%`;

  return (
    <div className="app">
      <header className="nav">
        <div className="nav-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true" />
            Plano
          </div>
          <div className="nav-tools">
            <div className="segmented mini" role="radiogroup" aria-label="Tema">
              {(["system", "light", "dark"] as Theme[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={theme === t}
                  aria-label={t === "system" ? "Tema del sistema" : t === "light" ? "Tema claro" : "Tema oscuro"}
                  title={t === "system" ? "Sistema" : t === "light" ? "Claro" : "Oscuro"}
                  className={theme === t ? "on" : ""}
                  onClick={() => applyTheme(t)}
                >
                  <ThemeIcon kind={t} />
                </button>
              ))}
            </div>
            <button type="button" className="link-btn" onClick={logout}>
              Salir
            </button>
          </div>
        </div>
      </header>

      <main>
        <section className="hero">
          <h1 className="hero-title">
            <span>Escribe una escena.</span>
            <span className="hero-dim">Mírala en movimiento.</span>
          </h1>
          <p className="hero-sub">
            Seedance 2.5 convierte tu texto en vídeo cinematográfico. Y sabes exactamente lo que cuesta antes de pulsar.
          </p>
        </section>

        <section className="theater" aria-label="Resultado">
          <div className={`stage-frame ${ratio(stageAspect) <= 1 ? "tall" : ""}`} ref={stageRef}>
            <div className="stage-glow" aria-hidden="true" />
            <div className="stage" style={{ aspectRatio: String(ratio(stageAspect)) }}>
              <StageContent take={active} now={now} onMetadata={onMetadata} onRetry={reuse} />
            </div>
          </div>
          {active && (
            <div className="caption">
              <p className="caption-prompt">{active.prompt}</p>
              <CostLine take={active} />
            </div>
          )}
        </section>

        <form className="composer glass" onSubmit={generate}>
          <label htmlFor="prompt" className="sr-only">
            Describe la escena
          </label>
          <textarea
            id="prompt"
            className="prompt"
            rows={3}
            maxLength={2000}
            placeholder="Describe la escena que quieres ver…"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate();
            }}
          />
          {!prompt && (
            <div className="ideas" aria-label="Ideas">
              {IDEAS.map((idea) => (
                <button type="button" key={idea} className="idea" onClick={() => setPrompt(idea)}>
                  {idea}
                </button>
              ))}
            </div>
          )}

          <div className="dock">
            <div className="settings">
              <div className="setting">
                <span className="setting-label" id="fmt-label">
                  Formato <b>{ASPECT_LABEL[aspect]}</b>
                </span>
                <div className="segmented glyphs" role="radiogroup" aria-labelledby="fmt-label">
                  {ASPECT_RATIOS.map((a) => (
                    <button
                      type="button"
                      key={a}
                      role="radio"
                      aria-checked={aspect === a}
                      aria-label={`${ASPECT_LABEL[a]} ${a}`}
                      title={`${ASPECT_LABEL[a]} ${a}`}
                      className={aspect === a ? "on" : ""}
                      onClick={() => {
                        setAspect(a);
                        setActiveId(null);
                      }}
                    >
                      <span className="glyph" style={{ aspectRatio: String(ratio(a)) }} aria-hidden="true" />
                      <span className="glyph-text">{a}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="setting">
                <label className="setting-label" htmlFor="duration">
                  Duración <b>{duration} s</b>
                </label>
                <input
                  id="duration"
                  type="range"
                  min={4}
                  max={maxDuration}
                  step={1}
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value))}
                  style={{ ["--pct" as string]: fill }}
                />
              </div>

              <div className="setting">
                <span className="setting-label" id="res-label">
                  Calidad
                </span>
                <div className="segmented" role="radiogroup" aria-labelledby="res-label">
                  {RESOLUTIONS.map((r) => (
                    <button
                      type="button"
                      key={r}
                      role="radio"
                      aria-checked={resolution === r}
                      className={resolution === r ? "on" : ""}
                      onClick={() => setResolution(r)}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <div className="setting">
                <span className="setting-label">Sonido</span>
                <label className="toggle">
                  <input type="checkbox" checked={audio} onChange={(e) => setAudio(e.target.checked)} />
                  <span className="toggle-track" aria-hidden="true" />
                  <span>{audio ? "Activado" : "Sin sonido"}</span>
                </label>
              </div>
            </div>

            <div className="checkout">
              <div className="price" aria-live="polite">
                <span className="price-value">
                  {price.exact ? "" : "≈ "}
                  {formatUSD(price.usd)}
                </span>
                <span className="price-detail">
                  {price.tokens.toLocaleString("es-ES")} tokens
                  {price.exact ? " · precio exacto" : " · el coste real se muestra al terminar"}
                </span>
              </div>
              <button className="btn-generate" disabled={!prompt.trim() || submitting}>
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M10 2.5l1.6 4.4 4.4 1.6-4.4 1.6L10 14.5l-1.6-4.4L4 8.5l4.4-1.6L10 2.5Z" />
                  <path d="M15.5 13.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6.6-1.4Z" />
                </svg>
                {submitting ? "Enviando…" : "Generar vídeo"}
              </button>
            </div>
          </div>
          {formError && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}
        </form>

        <section className="shelf" aria-labelledby="shelf-title">
          <div className="shelf-head">
            <h2 id="shelf-title">Tus vídeos</h2>
            {takes.length > 0 && <p className="shelf-total">Gastado en este dispositivo: {formatUSD(spent)}</p>}
          </div>
          {takes.length === 0 ? (
            <p className="shelf-empty">Cada vídeo que generes se guarda aquí, con lo que costó.</p>
          ) : (
            <ul className="shelf-row">
              {takes.map((t) => {
                const billed = t.status === "completed" || PENDING.includes(t.status);
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      className={`card ${t.id === activeId ? "on" : ""}`}
                      onClick={() => {
                        setActiveId(t.id);
                        stageRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                      }}
                      aria-current={t.id === activeId}
                    >
                      <span className={`card-thumb s-${t.status}`}>
                        {t.status === "completed" && t.videoUrl ? (
                          <video src={t.videoUrl} muted playsInline preload="metadata" />
                        ) : (
                          <span className="card-state">{STATUS_COPY[t.status]}</span>
                        )}
                        <span className="card-chip">
                          {t.aspect} · {t.duration} s · {t.resolution}
                        </span>
                      </span>
                      <span className="card-prompt">{t.prompt}</span>
                      <span className="card-meta">
                        <span>{t.status === "completed" ? "Listo" : STATUS_COPY[t.status]}</span>
                        {billed && (
                          <b>
                            {!t.actual && !t.quote.exact ? "≈ " : ""}
                            {formatUSD(t.actual?.usd ?? t.quote.usd)}
                          </b>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>

      <footer className="foot">
        <p>
          Seedance 2.5 vía Higgsfield. Precios oficiales de la API antes de descuentos: $0.0214 por cada 1.000 tokens
          en 480p y 720p, y $0.0234 en 1080p. Tokens = alto × ancho × segundos × 24 / 1024.
        </p>
      </footer>
    </div>
  );
}

function StageContent({
  take,
  now,
  onMetadata,
  onRetry,
}: {
  take: Take | null;
  now: number;
  onMetadata: (t: Take, v: HTMLVideoElement) => void;
  onRetry: (t: Take) => void;
}) {
  if (!take) {
    return (
      <div className="scene">
        <div className="aurora" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="scene-copy">
          <p className="scene-title">Tu vídeo aparecerá aquí</p>
          <p className="scene-sub">La pantalla adopta el formato que elijas.</p>
        </div>
      </div>
    );
  }
  if (PENDING.includes(take.status)) {
    return (
      <div className="scene" role="status">
        <div className="aurora live" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="scene-copy">
          <p className="scene-title">{STATUS_COPY[take.status]}…</p>
          <p className="scene-sub">
            {elapsed(take.createdAt, now)}. Suele tardar unos minutos y puedes cerrar la página: seguirá aquí.
          </p>
          <div className="progress" aria-hidden="true">
            <span />
          </div>
        </div>
      </div>
    );
  }
  if (take.status === "completed" && take.videoUrl) {
    return (
      <>
        <video
          key={take.id}
          className="stage-video"
          src={take.videoUrl}
          controls
          autoPlay
          loop
          playsInline
          onLoadedMetadata={(e) => onMetadata(take, e.currentTarget)}
        />
        <a className="download glass" href={take.videoUrl} target="_blank" rel="noopener noreferrer" download>
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M10 3v10m0 0-4-4m4 4 4-4M4 16h12" />
          </svg>
          Descargar
        </a>
      </>
    );
  }
  return (
    <div className="scene" role="alert">
      <div className="scene-copy">
        <p className="scene-title error">{STATUS_COPY[take.status]}</p>
        <p className="scene-sub">{FAILURE_COPY[take.status] ?? take.message ?? "Algo falló al generar el vídeo."}</p>
        <button type="button" className="pill-btn" onClick={() => onRetry(take)}>
          Editar y volver a generar
        </button>
      </div>
    </div>
  );
}

function CostLine({ take }: { take: Take }) {
  if (take.actual) {
    return (
      <p className="caption-cost">
        Coste <b>{formatUSD(take.actual.usd)}</b> · {take.actual.tokens.toLocaleString("es-ES")} tokens a{" "}
        {take.actual.width}×{take.actual.height}
      </p>
    );
  }
  const billed = take.status === "completed" || PENDING.includes(take.status);
  return (
    <p className="caption-cost">
      {billed ? (take.quote.exact ? "Coste " : "Coste estimado ") : "Presupuesto "}
      <b>{formatUSD(take.quote.usd)}</b> · {take.quote.tokens.toLocaleString("es-ES")} tokens
    </p>
  );
}

function ThemeIcon({ kind }: { kind: Theme }) {
  if (kind === "light")
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="3.5" />
        <path d="M10 2.5v1.8M10 15.7v1.8M2.5 10h1.8M15.7 10h1.8M4.7 4.7l1.3 1.3M14 14l1.3 1.3M4.7 15.3 6 14M14 6l1.3-1.3" />
      </svg>
    );
  if (kind === "dark")
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M16 12.3A6.5 6.5 0 0 1 7.7 4a6.5 6.5 0 1 0 8.3 8.3Z" />
      </svg>
    );
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="2.5" y="4" width="15" height="10" rx="2" />
      <path d="M7 17h6" />
    </svg>
  );
}
