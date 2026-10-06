"use client";

import type { Field } from "../../lib/catalog";

const ASPECT_NAMES: Record<string, string> = {
  "16:9": "Horizontal",
  "9:16": "Vertical",
  "1:1": "Cuadrado",
  "4:3": "Clásico",
  "3:4": "Retrato",
  "21:9": "Cine",
  "3:2": "Foto",
  "2:3": "Póster",
  auto: "Auto",
  adaptive: "Auto",
};

function ratioOf(v: string) {
  const [a, b] = v.split(":").map(Number);
  return a && b ? a / b : null;
}

function labelFor(f: Extract<Field, { type: "enum" }>, o: string | number) {
  const k = String(o);
  if (f.labels?.[k]) return f.labels[k];
  return k;
}

export function FieldControl({
  field,
  value,
  onChange,
  maxDuration,
}: {
  field: Field;
  value: unknown;
  onChange: (v: unknown) => void;
  maxDuration: number;
}) {
  const id = `f-${field.key}`;

  if (field.type === "enum" && field.key === "aspect_ratio") {
    const current = String(value ?? field.default ?? "");
    return (
      <div className="setting setting-wide">
        <span className="setting-label" id={`${id}-l`}>
          {field.label} <b>{ASPECT_NAMES[current] ?? current}</b>
        </span>
        <div className="segmented glyphs" role="radiogroup" aria-labelledby={`${id}-l`}>
          {field.options.map((o) => {
            const v = String(o);
            const r = ratioOf(v);
            return (
              <button
                type="button"
                key={v}
                role="radio"
                aria-checked={current === v}
                aria-label={`${ASPECT_NAMES[v] ?? v} ${v}`}
                title={`${ASPECT_NAMES[v] ?? v} ${r ? v : ""}`}
                className={current === v ? "on" : ""}
                onClick={() => onChange(v)}
              >
                {r ? <span className="glyph" style={{ aspectRatio: String(r) }} aria-hidden="true" /> : <span className="glyph auto" aria-hidden="true">A</span>}
                <span className="glyph-text">{r ? v : "Auto"}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (field.type === "enum") {
    const current = String(value ?? field.default ?? "");
    const opts = field.key === "duration" ? field.options.filter((o) => Number(o) <= maxDuration) : field.options;
    if (opts.length <= 4) {
      return (
        <div className="setting">
          <span className="setting-label" id={`${id}-l`}>
            {field.label}
          </span>
          <div className="segmented" role="radiogroup" aria-labelledby={`${id}-l`}>
            {opts.map((o) => (
              <button
                type="button"
                key={String(o)}
                role="radio"
                aria-checked={current === String(o)}
                className={current === String(o) ? "on" : ""}
                onClick={() => onChange(o)}
              >
                {labelFor(field, o)}
                {field.key === "duration" ? " s" : ""}
              </button>
            ))}
          </div>
        </div>
      );
    }
    return (
      <div className="setting">
        <label className="setting-label" htmlFor={id}>
          {field.label}
        </label>
        <div className="select">
          <select id={id} value={current} onChange={(e) => onChange(opts.find((o) => String(o) === e.target.value) ?? e.target.value)}>
            {opts.map((o) => (
              <option key={String(o)} value={String(o)}>
                {labelFor(field, o)}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  if (field.type === "int" && field.key === "duration") {
    const max = Math.min(field.max, maxDuration);
    const v = Math.min(Number(value ?? field.default ?? field.min), max);
    const pct = max > field.min ? ((v - field.min) / (max - field.min)) * 100 : 100;
    return (
      <div className="setting setting-grow">
        <label className="setting-label" htmlFor={id}>
          {field.label} <b>{v} s</b>
        </label>
        <input
          id={id}
          type="range"
          min={field.min}
          max={max}
          step={1}
          value={v}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ ["--pct" as string]: `${pct}%` }}
        />
      </div>
    );
  }

  if (field.type === "int") {
    const v = value === undefined || value === null ? "" : String(value);
    return (
      <div className="setting">
        <label className="setting-label" htmlFor={id}>
          {field.label}
        </label>
        <input
          id={id}
          className="num"
          type="number"
          inputMode="numeric"
          min={field.min}
          max={field.max}
          placeholder={field.key === "seed" ? "Aleatoria" : String(field.default ?? "")}
          value={v}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        />
      </div>
    );
  }

  if (field.type === "number") {
    const v = Number(value ?? field.default ?? field.min);
    const pct = ((v - field.min) / (field.max - field.min)) * 100;
    return (
      <div className="setting setting-grow">
        <label className="setting-label" htmlFor={id}>
          {field.label} <b>{v.toFixed(2)}</b>
        </label>
        <input
          id={id}
          type="range"
          min={field.min}
          max={field.max}
          step={field.step}
          value={v}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ ["--pct" as string]: `${pct}%` }}
        />
        {field.hint && <span className="setting-hint">{field.hint}</span>}
      </div>
    );
  }

  if (field.type === "bool" || field.type === "switch") {
    const checked = field.type === "bool" ? Boolean(value ?? field.default) : (value ?? field.default) === field.on;
    return (
      <div className="setting">
        <span className="setting-label">{field.label}</span>
        <label className="toggle">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(field.type === "bool" ? e.target.checked : e.target.checked ? field.on : field.off)}
          />
          <span className="toggle-track" aria-hidden="true" />
          <span>{checked ? "Sí" : "No"}</span>
        </label>
      </div>
    );
  }

  // text
  return (
    <div className="setting setting-wide">
      <label className="setting-label" htmlFor={id}>
        {field.label}
      </label>
      <input
        id={id}
        className="text"
        maxLength={field.maxLength}
        placeholder={field.placeholder}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
