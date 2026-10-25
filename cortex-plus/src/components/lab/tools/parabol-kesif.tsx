"use client";

import { useMemo, useState } from "react";
import { ToolField, ToolNumber, ToolShell, ToolSteps } from "@/components/lab/tool-shell";
import { parabolaAt } from "@/lib/lab/simulations";
import "@/styles/sim-lab.css";

const W = 360;
const H = 260;
const PAD = 24;

export function ParabolKesif() {
  const [a, setA] = useState(1);
  const [b, setB] = useState(-2);
  const [c, setC] = useState(-3);
  const info = useMemo(() => parabolaAt(a, b, c), [a, b, c]);

  const xs = useMemo(() => {
    const points = [...info.roots, info.vertex?.x ?? 0, 0];
    const span = Math.max(4, ...points.map((x) => Math.abs(x) + 1.5));
    return { min: -span, max: span };
  }, [info]);

  const path = useMemo(() => {
    const toX = (x: number) => PAD + ((x - xs.min) / (xs.max - xs.min)) * (W - PAD * 2);
    const samples: { x: number; y: number }[] = [];
    for (let i = 0; i <= 80; i += 1) {
      const x = xs.min + ((xs.max - xs.min) * i) / 80;
      samples.push({ x, y: a * x * x + b * x + c });
    }
    const ys = samples.map((p) => p.y);
    const yMin = Math.min(-2, ...ys);
    const yMax = Math.max(2, ...ys);
    const toY = (y: number) => H - PAD - ((y - yMin) / (yMax - yMin)) * (H - PAD * 2);
    const d = samples.map((p, i) => `${i === 0 ? "M" : "L"} ${toX(p.x).toFixed(1)} ${toY(p.y).toFixed(1)}`).join(" ");
    return {
      d,
      axisX: toY(0),
      axisY: toX(0),
      vertex: info.vertex ? { x: toX(info.vertex.x), y: toY(info.vertex.y) } : null,
      roots: info.roots.map((x) => ({ x: toX(x), y: toY(0) })),
    };
  }, [a, b, c, info, xs]);

  const rootLine =
    info.rootState === "iki"
      ? "İki gerçel kök (Δ > 0)"
      : info.rootState === "cift"
        ? "Çakışık kök (Δ = 0)"
        : info.rootState === "yok"
          ? "Gerçel kök yok (Δ < 0)"
          : "Doğrusal / özel durum";

  return (
    <ToolShell
      title="Parabol keşfedici"
      subject="Matematik"
      summary="f(x) = ax² + bx + c. Katsayıları kaydır; kollar, tepe T(r, k) ve diskriminant canlı değişir."
      inputs={
        <>
          <ToolNumber label="a" value={a} onChange={setA} step={0.1} />
          <ToolField label="a sürgüsü">
            <input type="range" min={-3} max={3} step={0.1} value={a} onChange={(e) => setA(Number(e.target.value))} aria-label="a" />
          </ToolField>
          <ToolNumber label="b" value={b} onChange={setB} step={0.1} />
          <ToolField label="b sürgüsü">
            <input type="range" min={-8} max={8} step={0.1} value={b} onChange={(e) => setB(Number(e.target.value))} aria-label="b" />
          </ToolField>
          <ToolNumber label="c" value={c} onChange={setC} step={0.1} />
          <ToolField label="c sürgüsü">
            <input type="range" min={-8} max={8} step={0.1} value={c} onChange={(e) => setC(Number(e.target.value))} aria-label="c" />
          </ToolField>
        </>
      }
      result={
        <div>
          <p className="sim-formula">
            f(x) = {a}x² + {b}x + {c}
          </p>
          <svg viewBox={`0 0 ${W} ${H}`} className="sim-svg" role="img" aria-label="Parabol grafiği">
            <line x1={PAD} y1={path.axisX} x2={W - PAD} y2={path.axisX} className="sim-axis" />
            <line x1={path.axisY} y1={PAD} x2={path.axisY} y2={H - PAD} className="sim-axis" />
            <path d={path.d} className="sim-curve" />
            {path.roots.map((root, index) => (
              <circle key={index} cx={root.x} cy={root.y} r={4} className="sim-root" />
            ))}
            {path.vertex ? <circle cx={path.vertex.x} cy={path.vertex.y} r={6} className="sim-vertex" /> : null}
          </svg>
        </div>
      }
    >
      <ToolSteps
        rows={[
          { label: "Diskriminant Δ = b² − 4ac", value: Number.isFinite(info.disc) ? info.disc.toFixed(2) : "—" },
          { label: "Kökler", value: rootLine },
          {
            label: "Tepe T(r, k)",
            value: info.vertex ? `T(${info.vertex.x.toFixed(2)}, ${info.vertex.y.toFixed(2)})` : "Yok (a = 0)",
          },
        ]}
      />
    </ToolShell>
  );
}
