"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  KIND_MODES,
  MODE_HINT,
  MODE_LABEL,
  SOUL_REFERENCE_MODELS,
  WORKFLOWS,
  aspectOf,
  defaultsFor,
  estimate,
  findWorkflow,
  fitsDuration,
  workflowsFor,
  type Estimate,
  type Kind,
  type Mode,
  type Workflow,
} from "../lib/catalog";
import { discountFactor, formatUSD } from "../lib/pricing";
import { FieldControl } from "./ui/fields";
import { uploadPhoto } from "./ui/upload";
import {
  IconCheck,
  IconChevron,
  IconClose,
  IconDownload,
  IconFilm,
  IconPerson,
  IconPhoto,
  IconPlus,
  IconSpark,
  IconTrash,
} from "./ui/icons";

// ---------- Tipos ----------
type Status = "queued" | "in_progress" | "completed" | "failed" | "nsfw" | "canceled" | "error";

interface Take {
  id: string;
  kind: Kind;
  model: string;
  modelName: string;
  prompt: string;
  aspect: string;
  estimate: Estimate;
  status: Status;
  videoUrl: string | null;
  images: string[];
  createdAt: number;
  message?: string;
}

interface Character {
  id: string;
  name: string;
  images: string[];
  soul?: { id: string; status: string };
  createdAt: number;
}

interface Slot {
  url: string;
  label?: string;
  characterId?: string;
}

type Theme = "system" | "light" | "dark";

// ---------- Constantes ----------
const HISTORY_KEY = "plano-history-v2";
const CHAR_KEY = "plano-characters";
const THEME_KEY = "plano-theme";
const PREFS_KEY = "plano-prefs";
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
  failed: "Higgsfield no pudo generarlo. Cambia la descripción o prueba otro modelo.",
  nsfw: "El filtro de contenido bloqueó esta petición. Reescríbela y vuelve a generarla.",
  canceled: "La generación se canceló antes de terminar.",
};

const DEFAULT_MODEL: Record<Mode, string> = {
  t2v: "bytedance/seedance-2.5/text-to-video",
  i2v: "bytedance/seedance-2.5/image-to-video",
  flf: "bytedance/seedance-2.5/image-to-video#flf",
  ref: "bytedance/seedance-2.5/reference-to-video",
  t2i: "higgsfield-ai/soul/v2/standard",
  edit: "xai/grok-imagine-image-2.0#edit",
};

const IDEAS: Record<Kind, string[]> = {
  video: [
    "Un faro al atardecer, la cámara se acerca despacio mientras las olas rompen contra las rocas",
    "Calle de Sevilla de noche con lluvia, reflejos de neón en los charcos, plano a ras de suelo",
    "Un astronauta camina por un campo de girasoles al amanecer, cámara en mano",
  ],
  image: [
    "Retrato editorial con luz de ventana, fondo neutro, película de 35 mm",
    "Cartel minimalista de un festival de verano con tipografía grande",
    "Bodegón de aceite de oliva sobre mármol, luz cálida de tarde",
  ],
};

// ---------- Utilidades ----------
function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
function ratio(aspect: string) {
  const [a, b] = aspect.split(":").map(Number);
  return a && b ? a / b : 16 / 9;
}
function elapsed(from: number, now: number) {
  const s = Math.max(0, Math.floor((now - from) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function uid() {
  return Math.random().toString(36).slice(2, 10);
}
function priceText(e: Estimate) {
  if (e.usd === null) return "Sin precio";
  const pre = { exact: "", approx: "≈ ", from: "desde ", atLeast: "más de ", unknown: "" }[e.basis] ?? "";
  return `${pre}${formatUSD(e.usd)}`;
}

// =========================================================
export default function Studio({ maxDuration, discount }: { maxDuration: number; discount: number }) {
  const factor = discountFactor(discount);

  const [kind, setKind] = useState<Kind>("video");
  const [mode, setMode] = useState<Mode>("t2v");
  const [modelByMode, setModelByMode] = useState<Record<Mode, string>>(DEFAULT_MODEL);
  const [paramsByModel, setParamsByModel] = useState<Record<string, Record<string, unknown>>>({});
  const [prompt, setPrompt] = useState("");
  const [start, setStart] = useState<Slot | null>(null);
  const [end, setEnd] = useState<Slot | null>(null);
  const [refs, setRefs] = useState<Slot[]>([]);
  const [soulChar, setSoulChar] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);

  const [takes, setTakes] = useState<Take[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [charEditor, setCharEditor] = useState<{ open: boolean; seed?: string[] }>({ open: false });
  const [charPickerOpen, setCharPickerOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>("system");
  const [now, setNow] = useState(() => Date.now());
  const [hydrated, setHydrated] = useState(false);

  const takesRef = useRef<Take[]>([]);
  takesRef.current = takes;
  const charsRef = useRef<Character[]>([]);
  charsRef.current = characters;
  const stageRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLFormElement>(null);

  // ---------- Carga inicial ----------
  useEffect(() => {
    const h = load<Take[]>(HISTORY_KEY, []);
    setTakes(h);
    setActiveId(h[0]?.id ?? null);
    setCharacters(load<Character[]>(CHAR_KEY, []));
    const prefs = load<{ kind?: Kind; mode?: Mode; modelByMode?: Record<Mode, string> }>(PREFS_KEY, {});
    if (prefs.modelByMode) {
      const valid = { ...DEFAULT_MODEL };
      for (const m of Object.keys(valid) as Mode[]) {
        const id = prefs.modelByMode[m];
        if (id && findWorkflow(id)?.mode === m) valid[m] = id;
      }
      setModelByMode(valid);
    }
    if (prefs.kind && prefs.mode && KIND_MODES[prefs.kind]?.includes(prefs.mode)) {
      setKind(prefs.kind);
      setMode(prefs.mode);
    }
    let t: string | null = null;
    try {
      t = localStorage.getItem(THEME_KEY);
      // Versiones anteriores lo guardaban con comillas: se corrige al vuelo.
      if (t === '"light"' || t === '"dark"') {
        t = t.replace(/"/g, "");
        localStorage.setItem(THEME_KEY, t);
        document.documentElement.dataset.theme = t;
      }
    } catch {}
    if (t === "light" || t === "dark") setTheme(t);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) save(HISTORY_KEY, takes.slice(0, 60));
  }, [takes, hydrated]);
  useEffect(() => {
    if (hydrated) save(CHAR_KEY, characters);
  }, [characters, hydrated]);
  useEffect(() => {
    if (hydrated) save(PREFS_KEY, { kind, mode, modelByMode });
  }, [kind, mode, modelByMode, hydrated]);

  function applyTheme(next: Theme) {
    setTheme(next);
    const root = document.documentElement;
    if (next === "system") {
      delete root.dataset.theme;
      try {
        localStorage.removeItem(THEME_KEY);
      } catch {}
    } else {
      root.dataset.theme = next;
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch {}
    }
  }

  // ---------- Modelo actual ----------
  const usable = workflowsFor(mode).filter((w) => fitsDuration(w, maxDuration));
  const chosen = findWorkflow(modelByMode[mode]);
  const workflow: Workflow = chosen && chosen.mode === mode && fitsDuration(chosen, maxDuration) ? chosen : usable[0] ?? workflowsFor(mode)[0];
  const params = useMemo(() => {
    const p = { ...defaultsFor(workflow), ...(paramsByModel[workflow.id] ?? {}) };
    if (workflow.durationKey && typeof p[workflow.durationKey] === "number") {
      const f = workflow.fields.find((x) => x.key === workflow.durationKey);
      const v = p[workflow.durationKey] as number;
      if (f && f.type === "int") p[workflow.durationKey] = Math.max(f.min, Math.min(v, maxDuration));
      if (f && f.type === "enum" && v > maxDuration) {
        const ok = f.options.map(Number).filter((o) => o <= maxDuration);
        if (ok.length) p[workflow.durationKey] = Math.max(...ok);
      }
    }
    return p;
  }, [workflow, paramsByModel, maxDuration]);
  const price = useMemo(() => estimate(workflow, params, factor), [workflow, params, factor]);

  function setParam(key: string, value: unknown) {
    setParamsByModel((prev) => ({ ...prev, [workflow.id]: { ...(prev[workflow.id] ?? {}), [key]: value } }));
    setActiveId(null);
  }

  function chooseKind(k: Kind) {
    setKind(k);
    setMode(KIND_MODES[k][0]);
    setFormError(null);
  }
  function chooseMode(m: Mode) {
    setMode(m);
    setFormError(null);
  }
  function chooseModel(id: string) {
    setModelByMode((prev) => ({ ...prev, [mode]: id }));
    setPickerOpen(false);
    setFormError(null);
  }

  // ---------- Fotos ----------
  async function handleFiles(files: FileList | File[], target: "start" | "end" | "refs") {
    if (uploading) {
      setFormError("Espera a que termine la subida en curso.");
      return;
    }
    const list = Array.from(files).filter((f) => f.type.startsWith("image/") || /\.(heic|heif)$/i.test(f.name));
    if (!list.length) {
      setFormError("Eso no es una foto. Usa JPG, PNG o WebP.");
      return;
    }
    setFormError(null);
    const max = workflow.media?.images?.max ?? 9;
    const room = target === "refs" ? Math.max(0, max - refs.length) : 1;
    const batch = list.slice(0, room);
    if (!batch.length) {
      setFormError(`Este modelo admite hasta ${max} referencias.`);
      return;
    }
    setUploading(target);
    try {
      for (const file of batch) {
        const url = await uploadPhoto(file);
        if (target === "start") setStart({ url });
        else if (target === "end") setEnd({ url });
        else setRefs((prev) => [...prev, { url }]);
      }
      if (target === "refs" && list.length > batch.length) setFormError(`Solo caben ${max} referencias en este modelo: se han subido ${batch.length}.`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "No se pudo subir la foto");
    } finally {
      setUploading(null);
    }
  }

  function addCharacterToRefs(c: Character) {
    const max = workflow.media?.images?.max ?? 9;
    setRefs((prev) => {
      if (prev.some((r) => r.characterId === c.id)) return prev;
      if (prev.length >= max) return prev;
      return [...prev, { url: c.images[0], label: c.name, characterId: c.id }];
    });
  }

  // ---------- Usar resultados ----------
  function useImageAs(url: string, target: "i2v" | "ref" | "edit") {
    setKind(target === "edit" ? "image" : "video");
    setMode(target);
    if (target === "i2v") setStart({ url });
    if (target === "edit") setStart({ url });
    if (target !== "i2v") setRefs((prev) => (prev.some((r) => r.url === url) ? prev : [...prev, { url }]));
    setActiveId(null);
    composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------- Polling ----------
  const updateTake = useCallback((id: string, patch: Partial<Take>) => {
    setTakes((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  const hasPending = takes.some((t) => PENDING.includes(t.status));
  useEffect(() => {
    if (!hasPending) return;
    let stop = false;
    const tick = async () => {
      const pending = takesRef.current.filter((t) => PENDING.includes(t.status));
      for (const t of pending)
        if (Date.now() - t.createdAt > 90 * 60 * 1000)
          updateTake(t.id, { status: "error", message: "Lleva más de hora y media sin terminar. Revisa el panel de Higgsfield o vuelve a generarlo." });
      await Promise.all(
        pending.map(async (t) => {
          const res = await fetch(`/api/status/${encodeURIComponent(t.id)}`, { cache: "no-store" }).catch(() => null);
          if (!res) return;
          if (res.status === 401) {
            window.location.href = "/acceso";
            return;
          }
          const data = (await res.json().catch(() => null)) as {
            status?: string;
            videoUrl?: string | null;
            images?: string[];
            error?: string;
          } | null;
          if (!data) return;
          if (!res.ok) return updateTake(t.id, { status: "error", message: data.error ?? "No se pudo consultar el estado." });
          const s = (data.status ?? "in_progress") as Status;
          const images = data.images ?? [];
          if (s === "completed" && !data.videoUrl && images.length === 0) {
            updateTake(t.id, { status: "error", message: "Higgsfield terminó sin devolver el resultado." });
          } else if (s in STATUS_COPY) {
            updateTake(t.id, { status: s, videoUrl: data.videoUrl ?? null, images });
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

  // Entrenamiento de personajes Soul ID.
  const soulPending = characters.some((c) => c.soul && !["completed", "failed"].includes(c.soul.status));
  useEffect(() => {
    if (!soulPending) return;
    const misses = new Map<string, number>();
    const tick = async () => {
      for (const c of charsRef.current) {
        if (!c.soul || ["completed", "failed"].includes(c.soul.status)) continue;
        const res = await fetch(`/api/soul/${c.soul.id}`, { cache: "no-store" }).catch(() => null);
        const data = (await res?.json().catch(() => null)) as { status?: string } | null;
        let status = data?.status;
        if (!status || status === "unknown") {
          const n = (misses.get(c.id) ?? 0) + 1;
          misses.set(c.id, n);
          if (n < 30) continue;
          status = "failed"; // ~4 min sin respuesta: se da por fallido
        }
        setCharacters((prev) => prev.map((x) => (x.id === c.id && x.soul ? { ...x, soul: { ...x.soul, status: status! } } : x)));
      }
    };
    tick();
    const t = setInterval(tick, 8000);
    return () => clearInterval(t);
  }, [soulPending]);

  // ---------- Generar ----------
  const media = workflow.media;
  const missingMedia =
    (media?.image?.required && !start) ||
    (media?.endImage?.required && !end) ||
    (media?.images?.required && refs.length < (media.images.min ?? 1));
  const refMax = media?.images?.max ?? 0;
  const overRefs = Boolean(media?.images) && refs.length > refMax;
  const promptMax = workflow.promptMax ?? 2000;
  const overPrompt = prompt.trim().length > promptMax;
  const canSubmit =
    !submitting && !uploading && !missingMedia && !overRefs && !overPrompt && (!workflow.promptRequired || prompt.trim().length > 0);
  const soulAllowed = SOUL_REFERENCE_MODELS.has(workflow.id);
  const soulReady = characters.filter((c) => c.soul?.status === "completed");

  async function generate(e?: React.FormEvent) {
    e?.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setFormError(null);
    const soul = soulAllowed && soulChar ? characters.find((c) => c.id === soulChar)?.soul?.id : undefined;
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: workflow.id,
        prompt: prompt.trim(),
        params,
        image: start?.url,
        endImage: end?.url,
        images: refs.map((r) => r.url),
        soulId: soul,
      }),
    }).catch(() => null);
    setSubmitting(false);

    if (!res) return setFormError("Sin conexión. Revisa tu red e inténtalo otra vez.");
    if (res.status === 401) return void (window.location.href = "/acceso");
    const data = (await res.json().catch(() => ({}))) as { id?: string; status?: string; estimate?: Estimate; error?: string };
    if (!res.ok || !data.id) return setFormError(data.error ?? "No se pudo iniciar la generación.");

    const take: Take = {
      id: data.id,
      kind: workflow.kind,
      model: workflow.id,
      modelName: workflow.name,
      prompt: prompt.trim() || "(sin descripción)",
      aspect: aspectOf(workflow, params),
      estimate: data.estimate ?? price,
      status: (data.status as Status) ?? "queued",
      videoUrl: null,
      images: [],
      createdAt: Date.now(),
    };
    setTakes((prev) => [take, ...prev]);
    setActiveId(take.id);
    setNow(Date.now());
    stageRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function logout() {
    await fetch("/api/login", { method: "DELETE" }).catch(() => null);
    window.location.href = "/acceso";
  }

  // ---------- Derivados de presentación ----------
  const active = takes.find((t) => t.id === activeId) ?? null;
  const stageAspect = active ? active.aspect : aspectOf(workflow, params);
  const done = takes.filter((t) => t.status === "completed" && t.estimate.usd !== null);
  const spent = done.reduce((s, t) => s + (t.estimate.usd ?? 0), 0);
  const spentApprox = done.some((t) => t.estimate.basis !== "exact") || takes.some((t) => t.status === "completed" && t.estimate.usd === null);
  const mainFields = workflow.fields.filter((f) => !f.advanced);
  const advFields = workflow.fields.filter((f) => f.advanced);

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
            <span>Imagínalo.</span>
            <span className="hero-dim">Míralo cobrar vida.</span>
          </h1>
          <p className="hero-sub">
            Vídeos e imágenes con {new Set(WORKFLOWS.map((w) => w.family)).size} familias de modelos de IA, tus fotos y tus
            personajes. Y sabes lo que cuesta antes de pulsar.
          </p>
        </section>

        <section className="theater" aria-label="Resultado">
          <div className={`stage-frame ${ratio(stageAspect) <= 1 ? "tall" : ""}`} ref={stageRef}>
            <div className="stage-glow" aria-hidden="true" />
            <div className="stage" style={{ aspectRatio: String(ratio(stageAspect)), ["--r" as string]: String(ratio(stageAspect)) }}>
              <StageContent
                take={active}
                now={now}
                onRetry={() => {
                  setActiveId(null);
                  composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                onUse={useImageAs}
                onCharacter={(url) => setCharEditor({ open: true, seed: [url] })}
                kind={kind}
              />
            </div>
          </div>
          {active && (
            <div className="caption">
              <p className="caption-prompt">{active.prompt}</p>
              <p className="caption-cost">
                <button
                  type="button"
                  className="link-btn small inline"
                  onClick={() => {
                    setTakes((p) => p.filter((t) => t.id !== active.id));
                    setActiveId(null);
                  }}
                >
                  Quitar del historial
                </button>{" "}
                · {active.modelName} ·{" "}
                {active.estimate.usd === null ? (
                  "precio no publicado"
                ) : (
                  <>
                    {active.estimate.basis === "exact"
                      ? "Coste "
                      : active.estimate.basis === "approx"
                        ? "Coste ≈ "
                        : active.estimate.basis === "atLeast"
                          ? "Coste: más de "
                          : "Coste desde "}
                    <b>{formatUSD(active.estimate.usd)}</b>
                  </>
                )}
              </p>
            </div>
          )}
        </section>

        {/* ---------- Compositor ---------- */}
        <form className="composer glass" onSubmit={generate} ref={composerRef}>
          <div className="composer-top">
            <div className="segmented kind" role="radiogroup" aria-label="Qué quieres crear">
              {(["video", "image"] as Kind[]).map((k) => (
                <button key={k} type="button" role="radio" aria-checked={kind === k} className={kind === k ? "on" : ""} onClick={() => chooseKind(k)}>
                  {k === "video" ? <IconFilm /> : <IconPhoto />}
                  {k === "video" ? "Vídeo" : "Imagen"}
                </button>
              ))}
            </div>
            <div className="modes" role="radiogroup" aria-label="Modo">
              {KIND_MODES[kind].map((m) => (
                <button key={m} type="button" role="radio" aria-checked={mode === m} className={`mode ${mode === m ? "on" : ""}`} onClick={() => chooseMode(m)}>
                  {MODE_LABEL[m]}
                </button>
              ))}
            </div>
          </div>
          <p className="mode-hint">{MODE_HINT[mode]}</p>

          <button type="button" className="model-card" onClick={() => setPickerOpen(true)} aria-haspopup="dialog">
            <span className="model-mark" aria-hidden="true">
              {workflow.family.slice(0, 1)}
            </span>
            <span className="model-info">
              <span className="model-name">{workflow.name}</span>
              <span className="model-blurb">{workflow.blurb}</span>
            </span>
            <span className="model-change">
              Cambiar <IconChevron />
            </span>
          </button>

          {/* Fotos */}
          {(media?.image || media?.endImage) && (
            <div className="frames">
              {media?.image && (
                <DropSlot
                  label={media.image.label ?? (mode === "flf" ? "Primer fotograma" : mode === "edit" ? "Foto a editar" : "Foto")}
                  required={media.image.required}
                  slot={start}
                  busy={uploading === "start"}
                  onFiles={(f) => handleFiles(f, "start")}
                  onClear={() => setStart(null)}
                  characters={characters}
                  onCharacter={(c) => setStart({ url: c.images[0], label: c.name, characterId: c.id })}
                />
              )}
              {media?.endImage && (
                <DropSlot
                  label={mode === "flf" ? "Último fotograma" : "Foto final (opcional)"}
                  required={media.endImage.required}
                  slot={end}
                  busy={uploading === "end"}
                  onFiles={(f) => handleFiles(f, "end")}
                  onClear={() => setEnd(null)}
                  characters={characters}
                  onCharacter={(c) => setEnd({ url: c.images[0], label: c.name, characterId: c.id })}
                />
              )}
            </div>
          )}

          {media?.images && (
            <div className="refs">
              <div className="refs-head">
                <span className={`setting-label ${overRefs ? "over" : ""}`}>
                  {kind === "video" ? "Referencias y personajes" : "Tus fotos"}{" "}
                  <b>
                    {refs.length}/{media.images.max}
                  </b>
                </span>
              </div>
              <div className="refs-row">
                {refs.map((r, i) => (
                  <figure className="ref" key={`${r.url}-${i}`}>
                    <img src={r.url} alt={r.label ?? `Referencia ${i + 1}`} />
                    <figcaption>
                      <span className="ref-num">{i + 1}</span>
                      {r.label && <span className="ref-name">{r.label}</span>}
                    </figcaption>
                    <button type="button" className="ref-remove" aria-label="Quitar" onClick={() => setRefs((p) => p.filter((_, j) => j !== i))}>
                      <IconClose />
                    </button>
                  </figure>
                ))}
                {refs.length < media.images.max && (
                  <>
                    <label className={`ref-add ${uploading === "refs" ? "busy" : ""}`}>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="sr-only"
                        onChange={(e) => {
                          if (e.target.files) handleFiles(e.target.files, "refs");
                          e.target.value = "";
                        }}
                      />
                      {uploading === "refs" ? <span className="spinner" aria-label="Subiendo" /> : <IconPhoto />}
                      <span>{uploading === "refs" ? "Subiendo…" : "Subir fotos"}</span>
                    </label>
                    {kind === "video" && (
                      <button type="button" className="ref-add" onClick={() => setCharPickerOpen(true)}>
                        <IconPerson />
                        <span>Personaje</span>
                      </button>
                    )}
                  </>
                )}
              </div>
              {refs.length > 1 && kind === "video" && (
                <p className="refs-tip">
                  Puedes nombrarlas en la descripción por su número, por ejemplo: «la persona de la imagen 1 abraza a la de la imagen 2».
                </p>
              )}
            </div>
          )}

          <label htmlFor="prompt" className="sr-only">
            Describe lo que quieres
          </label>
          <textarea
            id="prompt"
            className="prompt"
            rows={3}
            aria-describedby="prompt-count"
            aria-invalid={overPrompt}
            placeholder={workflow.promptRequired ? "Describe lo que quieres ver…" : "Describe el movimiento (opcional)…"}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate();
            }}
          />
          {prompt.length > promptMax * 0.8 && (
            <p id="prompt-count" className={`prompt-count ${overPrompt ? "over" : ""}`}>
              {prompt.trim().length}/{promptMax}
              {overPrompt && ` · ${workflow.name} admite hasta ${promptMax} caracteres`}
            </p>
          )}
          {!prompt && (
            <div className="ideas" aria-label="Ideas">
              {IDEAS[kind].map((idea) => (
                <button type="button" key={idea} className="idea" onClick={() => setPrompt(idea)}>
                  {idea}
                </button>
              ))}
            </div>
          )}

          <div className="dock">
            {soulAllowed && (
              <div className="soul-row">
                <span className="setting-label">Personaje (Soul ID)</span>
                <div className="soul-chips">
                  <button type="button" className={`chip ${!soulChar ? "on" : ""}`} onClick={() => setSoulChar(null)}>
                    Ninguno
                  </button>
                  {soulReady.map((c) => (
                    <button type="button" key={c.id} className={`chip ${soulChar === c.id ? "on" : ""}`} onClick={() => setSoulChar(c.id)}>
                      <img src={c.images[0]} alt="" />
                      {c.name}
                    </button>
                  ))}
                  {soulReady.length === 0 && <span className="soul-empty">Entrena un personaje abajo para usarlo aquí.</span>}
                </div>
              </div>
            )}

            <div className="settings">
              {mainFields.map((f) => (
                <FieldControl key={f.key} field={f} value={params[f.key]} onChange={(v) => setParam(f.key, v)} maxDuration={maxDuration} />
              ))}
            </div>

            {advFields.length > 0 && (
              <details className="advanced">
                <summary>Más ajustes</summary>
                <div className="settings">
                  {advFields.map((f) => (
                    <FieldControl key={f.key} field={f} value={params[f.key]} onChange={(v) => setParam(f.key, v)} maxDuration={maxDuration} />
                  ))}
                </div>
              </details>
            )}

            <div className="checkout">
              <div className="price" aria-live="polite">
                <span className="price-value">
                  {price.usd === null ? "—" : (
                    <>
                      {price.basis === "approx" && <small>≈ </small>}
                      {price.basis === "from" && <small>desde </small>}
                      {price.basis === "atLeast" && <small>más de </small>}
                      {formatUSD(price.usd)}
                    </>
                  )}
                </span>
                <span className="price-detail">
                  {price.basis === "exact" && `${price.detail} · precio exacto`}
                  {price.basis === "approx" && price.detail}
                  {price.basis === "from" && `${price.detail} · precio mínimo publicado`}
                  {price.basis === "atLeast" && `Con estos ajustes cuesta más; Higgsfield no publica cuánto (${price.detail})`}
                  {price.basis === "unknown" && "Higgsfield no publica el precio de este modelo"}
                </span>
              </div>
              <button className="btn-generate" disabled={!canSubmit}>
                <IconSpark />
                {submitting ? "Enviando…" : kind === "video" ? "Generar vídeo" : "Generar imagen"}
              </button>
            </div>
          </div>
          {formError && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}
          {!formError && overRefs && (
            <p className="form-error" role="alert">
              {workflow.name} admite como máximo {refMax} referencias. Quita {refs.length - refMax} para continuar.
            </p>
          )}
          {!formError && !overRefs && missingMedia && (
            <p className="form-note">{media?.images ? "Añade al menos una foto o personaje." : "Sube la foto para continuar."}</p>
          )}
        </form>

        {/* ---------- Personajes ---------- */}
        <section className="shelf" aria-labelledby="chars-title">
          <div className="shelf-head">
            <h2 id="chars-title">Personajes</h2>
            <p className="shelf-total">Créalos una vez y úsalos en cualquier vídeo o imagen.</p>
          </div>
          <ul className="char-row">
            <li>
              <button type="button" className="char-new" onClick={() => setCharEditor({ open: true })}>
                <span className="char-new-icon">
                  <IconPlus />
                </span>
                Nuevo personaje
              </button>
            </li>
            {characters.map((c) => (
              <li key={c.id}>
                <div className="char-card">
                  <img src={c.images[0]} alt={c.name} />
                  <div className="char-body">
                    <span className="char-name">{c.name}</span>
                    <span className="char-meta">
                      {c.images.length} {c.images.length === 1 ? "foto" : "fotos"}
                      {c.soul && ` · Soul ID ${c.soul.status === "completed" ? "listo" : c.soul.status === "failed" ? "falló" : "entrenando…"}`}
                    </span>
                    <div className="char-actions">
                      <button
                        type="button"
                        className="pill-mini"
                        onClick={() => {
                          setKind("video");
                          setMode("ref");
                          const w = findWorkflow(modelByMode.ref) ?? workflowsFor("ref")[0];
                          setRefs((prev) =>
                            prev.some((r) => r.characterId === c.id) || prev.length >= (w.media?.images?.max ?? 9)
                              ? prev
                              : [...prev, { url: c.images[0], label: c.name, characterId: c.id }],
                          );
                          composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }}
                      >
                        En vídeo
                      </button>
                      {c.soul?.status === "completed" && (
                        <button
                          type="button"
                          className="pill-mini"
                          onClick={() => {
                            setKind("image");
                            setMode("t2i");
                            setModelByMode((p) => ({ ...p, t2i: SOUL_REFERENCE_MODELS.has(p.t2i) ? p.t2i : "higgsfield-ai/soul/v2/standard" }));
                            setSoulChar(c.id);
                            composerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                          }}
                        >
                          En imagen
                        </button>
                      )}
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label={`Borrar ${c.name}`}
                        onClick={() => {
                          if (confirm(`¿Borrar a ${c.name}? Las fotos siguen en tu historial.`))
                            setCharacters((p) => p.filter((x) => x.id !== c.id));
                        }}
                      >
                        <IconTrash />
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* ---------- Historial ---------- */}
        <section className="shelf" aria-labelledby="shelf-title">
          <div className="shelf-head">
            <h2 id="shelf-title">Tus creaciones</h2>
            {done.length > 0 && (
              <p className="shelf-total">
                Gastado en este dispositivo: {spentApprox ? "≈ " : ""}
                {formatUSD(spent)}
              </p>
            )}
          </div>
          {takes.length === 0 ? (
            <p className="shelf-empty">Cada vídeo e imagen que generes se guarda aquí, con lo que costó.</p>
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
                          <video src={`${t.videoUrl}#t=0.1`} muted playsInline preload="metadata" onError={(e) => (e.currentTarget.style.display = "none")} />
                        ) : t.status === "completed" && t.images[0] ? (
                          <img src={t.images[0]} alt="" loading="lazy" onError={(e) => (e.currentTarget.style.display = "none")} />
                        ) : (
                          <span className="card-state">{STATUS_COPY[t.status]}</span>
                        )}
                        <span className="card-chip">
                          {t.kind === "video" ? "Vídeo" : t.images.length > 1 ? `${t.images.length} imágenes` : "Imagen"} · {t.modelName}
                        </span>
                      </span>
                      <span className="card-prompt">{t.prompt}</span>
                      <span className="card-meta">
                        <span>{STATUS_COPY[t.status]}</span>
                        {billed && t.estimate.usd !== null && <b>{priceText(t.estimate)}</b>}
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
          Precios de lista de la API de Higgsfield{discount > 0 ? ` con un ${discount}% de descuento` : ""}. «Exacto» se calcula con la
          fórmula oficial; «desde» es el precio mínimo que publica Higgsfield para ese modelo.
        </p>
      </footer>

      {pickerOpen && (
        <ModelPicker
          mode={mode}
          current={workflow.id}
          params={params}
          factor={factor}
          maxDuration={maxDuration}
          onPick={chooseModel}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {charPickerOpen && (
        <Sheet title="Añadir personaje" onClose={() => setCharPickerOpen(false)}>
          {characters.length === 0 ? (
            <div className="sheet-empty">
              <p>Todavía no tienes personajes.</p>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setCharPickerOpen(false);
                  setCharEditor({ open: true });
                }}
              >
                Crear personaje
              </button>
            </div>
          ) : (
            <ul className="pick-chars">
              {characters.map((c) => {
                const on = refs.some((r) => r.characterId === c.id);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      className={`pick-char ${on ? "on" : ""}`}
                      onClick={() => {
                        if (on) setRefs((p) => p.filter((r) => r.characterId !== c.id));
                        else addCharacterToRefs(c);
                      }}
                    >
                      <img src={c.images[0]} alt="" />
                      <span>{c.name}</span>
                      {on && <IconCheck />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Sheet>
      )}

      {charEditor.open && (
        <CharacterEditor
          seed={charEditor.seed}
          onClose={() => setCharEditor({ open: false })}
          onSave={(c) => {
            setCharacters((p) => [c, ...p]);
            setCharEditor({ open: false });
          }}
        />
      )}
    </div>
  );
}

// =========================================================
function StageContent({
  take,
  now,
  kind,
  onRetry,
  onUse,
  onCharacter,
}: {
  take: Take | null;
  now: number;
  kind: Kind;
  onRetry: () => void;
  onUse: (url: string, target: "i2v" | "ref" | "edit") => void;
  onCharacter: (url: string) => void;
}) {
  const [broken, setBroken] = useState<string | null>(null);
  if (take && broken === take.id) {
    const url = take.videoUrl ?? take.images[0] ?? null;
    return (
      <div className="scene" role="alert">
        <div className="scene-copy">
          <p className="scene-title">{take.videoUrl ? "No se puede reproducir aquí" : "No se puede mostrar la imagen"}</p>
          <p className="scene-sub">
            Puede que el archivo haya caducado (Higgsfield borra los resultados pasado un tiempo)
            {take.videoUrl ? " o que este navegador no admita el formato del vídeo" : ""}. Prueba a abrirlo directamente.
          </p>
          {url && (
            <a className="pill-btn" href={url} target="_blank" rel="noopener noreferrer">
              Abrir el archivo
            </a>
          )}
        </div>
      </div>
    );
  }
  if (!take) {
    return (
      <div className="scene">
        <div className="aurora" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="scene-copy">
          <p className="scene-title">{kind === "video" ? "Tu vídeo aparecerá aquí" : "Tu imagen aparecerá aquí"}</p>
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
            {elapsed(take.createdAt, now)}. {take.kind === "video" ? "Suele tardar unos minutos" : "Suele tardar segundos"}; puedes cerrar la
            página y volver.
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
          onError={() => setBroken(take.id)}
        />
        <a className="download glass" href={take.videoUrl} target="_blank" rel="noopener noreferrer" download>
          <IconDownload />
          Descargar
        </a>
      </>
    );
  }
  if (take.status === "completed" && take.images.length) {
    return (
      <div className={`gallery n${Math.min(take.images.length, 4)}`}>
        {take.images.map((url) => (
          <figure key={url} className="gallery-item">
            <img src={url} alt={take.prompt} onError={() => setBroken(take.id)} />
            <div className="gallery-actions">
              <button type="button" className="glass-pill" onClick={() => onUse(url, "i2v")}>
                <IconFilm /> Animar
              </button>
              <button type="button" className="glass-pill" onClick={() => onUse(url, "ref")}>
                Usar en vídeo
              </button>
              <button type="button" className="glass-pill" onClick={() => onUse(url, "edit")}>
                Editar
              </button>
              <button type="button" className="glass-pill" onClick={() => onCharacter(url)}>
                <IconPerson /> Personaje
              </button>
              <a className="glass-pill" href={url} target="_blank" rel="noopener noreferrer" download aria-label="Descargar">
                <IconDownload />
              </a>
            </div>
          </figure>
        ))}
      </div>
    );
  }
  return (
    <div className="scene" role="alert">
      <div className="scene-copy">
        <p className="scene-title error">{STATUS_COPY[take.status]}</p>
        <p className="scene-sub">{FAILURE_COPY[take.status] ?? take.message ?? "Algo falló al generar."}</p>
        <button type="button" className="pill-btn" onClick={onRetry}>
          Editar y volver a generar
        </button>
      </div>
    </div>
  );
}

// ---------- Hueco para foto ----------
function DropSlot({
  label,
  required,
  slot,
  busy,
  onFiles,
  onClear,
  characters,
  onCharacter,
}: {
  label: string;
  required: boolean;
  slot: Slot | null;
  busy: boolean;
  onFiles: (f: FileList) => void;
  onClear: () => void;
  characters: Character[];
  onCharacter: (c: Character) => void;
}) {
  const [over, setOver] = useState(false);
  const [showChars, setShowChars] = useState(false);
  if (slot) {
    return (
      <figure className="slot filled">
        <img src={slot.url} alt={slot.label ?? label} />
        <figcaption>{slot.label ?? label}</figcaption>
        <button type="button" className="ref-remove" aria-label="Quitar foto" onClick={onClear}>
          <IconClose />
        </button>
      </figure>
    );
  }
  return (
    <div className="slot-wrap">
      <label
        className={`slot ${over ? "over" : ""} ${busy ? "busy" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
        }}
      >
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) onFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {busy ? <span className="spinner" aria-label="Subiendo" /> : <IconPhoto />}
        <span className="slot-label">
          {busy ? "Subiendo…" : label}
          {!busy && !required && <small> · opcional</small>}
        </span>
        <span className="slot-sub">Toca o arrastra una foto</span>
      </label>
      {characters.length > 0 && !busy && (
        <div className="slot-chars">
          <button type="button" className="link-btn small" onClick={() => setShowChars((v) => !v)}>
            <IconPerson /> Usar un personaje
          </button>
          {showChars && (
            <div className="soul-chips">
              {characters.map((c) => (
                <button type="button" key={c.id} className="chip" onClick={() => onCharacter(c)}>
                  <img src={c.images[0]} alt="" />
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Hoja modal ----------
function Sheet({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      // Mantener el foco del teclado dentro de la hoja.
      if (e.key === "Tab" && panelRef.current) {
        const items = panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input, select, textarea, a[href]");
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.querySelector<HTMLElement>(".sheet-body button, .sheet-body input")?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      opener?.focus?.();
    };
  }, []);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        ref={panelRef}
        className={`sheet glass ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head">
          <h3>{title}</h3>
          <button type="button" className="icon-btn" aria-label="Cerrar" onClick={onClose}>
            <IconClose />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

// ---------- Selector de modelos ----------
function ModelPicker({
  mode,
  current,
  params,
  factor,
  maxDuration,
  onPick,
  onClose,
}: {
  mode: Mode;
  current: string;
  params: Record<string, unknown>;
  factor: number;
  maxDuration: number;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [sort, setSort] = useState<"featured" | "cheap">("featured");
  const list = workflowsFor(mode);
  const priced = list.map((w) => {
    // Precio de referencia con los ajustes por defecto del modelo (duración actual si existe).
    const p = { ...defaultsFor(w) };
    if (w.durationKey && typeof params.duration === "number") {
      const f = w.fields.find((x) => x.key === w.durationKey);
      if (f?.type === "int") p[w.durationKey] = Math.max(f.min, Math.min(f.max, maxDuration, params.duration as number));
    }
    return { w, e: estimate(w, p, factor), sec: Number(w.durationKey ? p[w.durationKey] : 0) };
  });
  const sorted =
    sort === "cheap"
      ? [...priced].sort((a, b) => (a.e.usd ?? Infinity) - (b.e.usd ?? Infinity))
      : priced;
  return (
    <Sheet title={`Modelos · ${MODE_LABEL[mode]}`} onClose={onClose} wide>
      <div className="picker-tools">
        <div className="segmented" role="radiogroup" aria-label="Ordenar">
          <button type="button" role="radio" aria-checked={sort === "featured"} className={sort === "featured" ? "on" : ""} onClick={() => setSort("featured")}>
            Destacados
          </button>
          <button type="button" role="radio" aria-checked={sort === "cheap"} className={sort === "cheap" ? "on" : ""} onClick={() => setSort("cheap")}>
            Más baratos
          </button>
        </div>
        <span className="picker-count">{list.length} modelos</span>
      </div>
      <ul className="picker-list">
        {sorted.map(({ w, e, sec }) => (
          <li key={w.id}>
            <button
              type="button"
              className={`picker-item ${w.id === current ? "on" : ""}`}
              onClick={() => onPick(w.id)}
              disabled={!fitsDuration(w, maxDuration)}
              aria-current={w.id === current}
            >
              <span className="model-mark" aria-hidden="true">
                {w.family.slice(0, 1)}
              </span>
              <span className="picker-main">
                <span className="picker-name">
                  {w.name}
                  {w.id === current && <IconCheck />}
                </span>
                <span className="picker-blurb">
                  {fitsDuration(w, maxDuration) ? w.blurb : `No disponible: su vídeo más corto supera el límite de ${maxDuration} s de esta web.`}
                </span>
                <span className="tags">
                  {w.tags.map((t) => (
                    <span className="tag" key={t}>
                      {t}
                    </span>
                  ))}
                </span>
              </span>
              <span className="picker-price">
                {e.usd === null ? (
                  <span className="muted">Sin precio</span>
                ) : (
                  <>
                    <b>{priceText(e)}</b>
                    <small>{w.kind === "video" ? `${sec} s` : "por imagen"}</small>
                  </>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

// ---------- Editor de personajes ----------
function CharacterEditor({ seed, onClose, onSave }: { seed?: string[]; onClose: () => void; onSave: (c: Character) => void }) {
  const [name, setName] = useState("");
  const [images, setImages] = useState<string[]>(seed ?? []);
  const [busy, setBusy] = useState(false);
  const [train, setTrain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function add(files: FileList) {
    setBusy(true);
    setError(null);
    try {
      for (const f of Array.from(files).slice(0, 20 - images.length)) {
        const url = await uploadPhoto(f);
        setImages((p) => [...p, url]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo subir la foto");
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!name.trim() || !images.length) return;
    setSaving(true);
    setError(null);
    let soul: Character["soul"];
    if (train) {
      const res = await fetch("/api/soul", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), images }),
      }).catch(() => null);
      const data = (await res?.json().catch(() => ({}))) as { id?: string; status?: string; error?: string };
      if (!res?.ok || !data.id) {
        setSaving(false);
        setError(data?.error ?? "No se pudo entrenar el personaje. Puedes guardarlo sin entrenar.");
        return;
      }
      soul = { id: data.id, status: data.status ?? "queued" };
    }
    onSave({ id: uid(), name: name.trim(), images, soul, createdAt: Date.now() });
  }

  return (
    <Sheet title="Nuevo personaje" onClose={onClose}>
      <div className="editor">
        <label className="setting-label" htmlFor="char-name">
          Nombre
        </label>
        <input id="char-name" className="text" maxLength={60} placeholder="Por ejemplo: Lucía" value={name} onChange={(e) => setName(e.target.value)} autoFocus />

        <span className="setting-label">
          Fotos <b>{images.length}</b>
        </span>
        <div className="refs-row">
          {images.map((url, i) => (
            <figure className="ref" key={url}>
              <img src={url} alt={`Foto ${i + 1}`} />
              {i === 0 && (
                <figcaption>
                  <span className="ref-name">Portada</span>
                </figcaption>
              )}
              <button type="button" className="ref-remove" aria-label="Quitar" onClick={() => setImages((p) => p.filter((_, j) => j !== i))}>
                <IconClose />
              </button>
            </figure>
          ))}
          <label className={`ref-add ${busy ? "busy" : ""}`}>
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(e) => {
                if (e.target.files) add(e.target.files);
                e.target.value = "";
              }}
            />
            {busy ? <span className="spinner" aria-label="Subiendo" /> : <IconPhoto />}
            <span>{busy ? "Subiendo…" : "Añadir"}</span>
          </label>
        </div>
        <p className="editor-tip">
          Para vídeo basta una foto clara de la cara o del cuerpo entero. Para entrenar un Soul ID, cuantas más fotos variadas (ángulos, luces,
          expresiones), mejor: entre 10 y 20 es ideal.
        </p>

        <label className="toggle editor-toggle">
          <input type="checkbox" checked={train} onChange={(e) => setTrain(e.target.checked)} />
          <span className="toggle-track" aria-hidden="true" />
          <span>
            Entrenar Soul ID
            <small>Para imágenes con Soul 2.0 y Soul Cinema con su cara. Higgsfield no publica el precio del entrenamiento.</small>
          </span>
        </label>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="button" className="btn-primary" disabled={!name.trim() || !images.length || busy || saving} onClick={submit}>
          {saving ? "Guardando…" : train ? "Guardar y entrenar" : "Guardar personaje"}
        </button>
      </div>
    </Sheet>
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
