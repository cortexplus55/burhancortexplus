"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser, X } from "lucide-react";
import { dispatchComposerAttach } from "@/lib/student/composer-bridge";

export function AstraSketchDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [stroke, setStroke] = useState("#f4f4f5");

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#18181b";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  useEffect(() => {
    if (!open) return;
    clearCanvas();
  }, [open, clearCanvas]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function pointFromEvent(
    clientX: number,
    clientY: number,
  ): { x: number; y: number } | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }

  function startDraw(x: number, y: number) {
    drawing.current = true;
    last.current = { x, y };
  }

  function moveDraw(x: number, y: number) {
    if (!drawing.current || !last.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    last.current = { x, y };
  }

  function endDraw() {
    drawing.current = false;
    last.current = null;
  }

  async function saveSketch() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png"),
    );
    if (!blob) return;
    const file = new File([blob], "cizim-sorusu.png", { type: "image/png" });
    dispatchComposerAttach({ type: "file", file });
    onClose();
  }

  return (
    <div
      className="ap-profile-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Çizim tahtası"
      onClick={onClose}
    >
      <div className="ap-sketch-dialog ap-profile-panel" onClick={(e) => e.stopPropagation()}>
        <div className="ap-sketch-head">
          <h2>Sorunu çiz</h2>
          <button type="button" className="ap-profile-close" aria-label="Kapat" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="ap-sketch-hint text-sm text-[var(--ap-muted)]">
          Tahtaya çiz; kaydedince composer’a eklenir ve gönderebilirsin.
        </p>
        <div className="ap-sketch-tools">
          {(["#f4f4f5", "#f4ae0b", "#60a5fa", "#f87171"] as const).map((color) => (
            <button
              key={color}
              type="button"
              className={stroke === color ? "ap-sketch-color ap-sketch-color--active" : "ap-sketch-color"}
              style={{ background: color }}
              aria-label="Renk"
              onClick={() => setStroke(color)}
            />
          ))}
          <button type="button" className="ap-chip" onClick={clearCanvas}>
            <Eraser className="mr-1 inline h-4 w-4" aria-hidden />
            Temizle
          </button>
        </div>
        <canvas
          ref={canvasRef}
          width={640}
          height={360}
          className="ap-sketch-canvas"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            const p = pointFromEvent(e.clientX, e.clientY);
            if (p) startDraw(p.x, p.y);
          }}
          onPointerMove={(e) => {
            const p = pointFromEvent(e.clientX, e.clientY);
            if (p) moveDraw(p.x, p.y);
          }}
          onPointerUp={endDraw}
          onPointerLeave={endDraw}
        />
        <div className="ap-sketch-actions">
          <button type="button" className="ap-chip" onClick={onClose}>
            Vazgeç
          </button>
          <button type="button" className="ap-exam-continue ap-exam-continue--primary" onClick={() => void saveSketch()}>
            Composer’a ekle
          </button>
        </div>
      </div>
    </div>
  );
}
