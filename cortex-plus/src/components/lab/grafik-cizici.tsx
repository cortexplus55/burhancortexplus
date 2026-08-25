"use client";

import { useCallback, useRef, useState } from "react";

export function GrafikCiziciLab() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [expr, setExpr] = useState("x");

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#0c0c0c";
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = "#333";
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.stroke();

    ctx.strokeStyle = "#6ee7b7";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let px = 0; px < w; px++) {
      const x = (px - w / 2) / 40;
      let y = 0;
      try {
        const fn = new Function("x", `return ${expr}`);
        y = Number(fn(x));
        if (!Number.isFinite(y)) y = 0;
      } catch {
        y = 0;
      }
      const py = h / 2 - y * 40;
      if (px === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }, [expr]);

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--astra-muted)]">
        y = f(x) — x değişkenini kullan (ör. x*x, Math.sin(x)).
      </p>
      <input
        value={expr}
        onChange={(e) => setExpr(e.target.value)}
        onBlur={draw}
        className="w-full rounded-xl border border-[var(--astra-border)] bg-[var(--astra-surface)] px-3 py-2 text-sm"
        aria-label="Fonksiyon"
      />
      <button
        type="button"
        className="astra-btn-primary rounded-full px-4 py-2 text-sm"
        onClick={draw}
      >
        Çiz
      </button>
      <canvas
        ref={canvasRef}
        width={360}
        height={240}
        className="w-full max-w-md rounded-2xl border border-[var(--astra-border)]"
      />
    </div>
  );
}
