"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

type Pen = "white" | "blue" | "red" | "erase";

const COLORS: Record<Exclude<Pen, "erase">, string> = {
  white: "#f5f5f5",
  blue: "#7aa2ff",
  red: "#ff6b6b",
};

/** Soru sırasında karalama. Sunucuya gitmez, kredi düşmez. */
export function ScratchPad() {
  const [open, setOpen] = useState(false);
  const [pen, setPen] = useState<Pen>("white");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas || canvas.dataset.ready === "1") return;
    const width = canvas.clientWidth || 320;
    const height = 160;
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * ratio);
    canvas.height = Math.floor(height * ratio);
    canvas.dataset.ready = "1";
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }, [open]);

  function point(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function down(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    drawing.current = true;
    canvas.setPointerCapture(event.pointerId);
    const start = point(event);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
  }

  function move(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const next = point(event);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (pen === "erase") {
      ctx.globalCompositeOperation = "destination-out";
      ctx.lineWidth = 18;
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = COLORS[pen];
      ctx.lineWidth = 2.5;
    }
    ctx.lineTo(next.x, next.y);
    ctx.stroke();
  }

  function up(event: ReactPointerEvent<HTMLCanvasElement>) {
    drawing.current = false;
    const canvas = canvasRef.current;
    if (canvas?.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const ratio = window.devicePixelRatio || 1;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.restore();
  }

  return (
    <div className="cp-scratch">
      <button type="button" className="cp-exam-continue" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        İşlem Tahtası
      </button>
      {open ? (
        <div className="mt-2 rounded-2xl border border-[var(--cp-border)] bg-[var(--cp-surface)] p-3">
          <div className="mb-2 flex flex-wrap gap-2" role="toolbar" aria-label="Kalem">
            {(
              [
                ["white", "Beyaz"],
                ["blue", "Mavi"],
                ["red", "Kırmızı"],
                ["erase", "Silgi"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                aria-pressed={pen === id}
                className="cp-exam-continue"
                onClick={() => setPen(id)}
              >
                {label}
              </button>
            ))}
            <button type="button" className="cp-exam-continue" onClick={clear}>
              Temizle
            </button>
          </div>
          <canvas
            ref={canvasRef}
            aria-label="İşlem tahtası"
            className="block w-full rounded-xl bg-[#141414]"
            style={{ height: 160, touchAction: "none" }}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
          />
        </div>
      ) : null}
    </div>
  );
}
