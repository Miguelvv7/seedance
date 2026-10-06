"use client";

import { useState } from "react";

export default function Acceso() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    }).catch(() => null);
    if (res?.ok) {
      window.location.href = "/";
      return;
    }
    setBusy(false);
    setError(res ? "Ese código no es correcto. Pídeselo de nuevo a quien te pasó el enlace." : "Sin conexión. Revisa tu red e inténtalo otra vez.");
  }

  return (
    <main className="gate">
      <form className="gate-card glass" onSubmit={submit}>
        <div className="gate-mark" aria-hidden="true">
          <span />
        </div>
        <h1>Plano</h1>
        <p>Escribe el código de acceso para empezar a crear vídeos.</p>
        <label className="sr-only" htmlFor="code">
          Código de acceso
        </label>
        <input
          id="code"
          className="field"
          autoFocus
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="Código de acceso"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "gate-error" : undefined}
        />
        {error && (
          <p id="gate-error" className="gate-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn-primary" disabled={busy || !code.trim()}>
          {busy ? "Comprobando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
