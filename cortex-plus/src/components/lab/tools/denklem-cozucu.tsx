"use client";

import { useMemo, useState } from "react";
import {
  ToolNumber,
  ToolShell,
  ToolSteps,
} from "@/components/lab/tool-shell";

/**
 * İkinci derece denklem çözücü.
 *
 * Sadece kökleri vermiyor: diskriminant, tepe noktası ve parabol birlikte
 * duruyor. Öğrencinin çoğu "kök yok" cevabını alıp duruyor; parabolün
 * ekseni hiç kesmediğini görmek o cevabı anlamlı kılıyor.
 *
 * Karmaşık kökler de yazılıyor — "çözüm yok" demek matematiksel olarak
 * yanlış ve öğrenciyi ileride yanıltıyor.
 */

const round = (v: number) => Math.round(v * 1000) / 1000;

export function DenklemCozucu() {
  const [a, setA] = useState(1);
  const [b, setB] = useState(-5);
  const [c, setC] = useState(6);

  const solution = useMemo(() => {
    if (a === 0) {
      // Aslında birinci derece; sessizce yanlış cevap vermek yerine söyle.
      if (b === 0) {
        return {
          kind: c === 0 ? ("sonsuz" as const) : ("yok" as const),
          text: c === 0 ? "Her x çözüm" : "Çözüm yok",
          roots: [] as number[],
          disc: NaN,
        };
      }
      const x = -c / b;
      return {
        kind: "dogrusal" as const,
        text: `x = ${round(x)}`,
        roots: [x],
        disc: NaN,
      };
    }

    const disc = b * b - 4 * a * c;
    if (disc > 0) {
      const s = Math.sqrt(disc);
      const x1 = (-b + s) / (2 * a);
      const x2 = (-b - s) / (2 * a);
      return {
        kind: "iki" as const,
        text: `x₁ = ${round(x1)}   x₂ = ${round(x2)}`,
        roots: [x1, x2],
        disc,
      };
    }
    if (disc === 0) {
      const x = -b / (2 * a);
      return { kind: "cift" as const, text: `x = ${round(x)}`, roots: [x], disc };
    }
    const re = -b / (2 * a);
    const im = Math.sqrt(-disc) / (2 * a);
    return {
      kind: "karmasik" as const,
      text: `x = ${round(re)} ± ${round(Math.abs(im))}i`,
      roots: [],
      disc,
    };
  }, [a, b, c]);

  const vertexX = a !== 0 ? -b / (2 * a) : 0;
  const vertexY = a * vertexX * vertexX + b * vertexX + c;

  // Parabol penceresi köklere ve tepeye göre seçiliyor; sabit pencere
  // büyük katsayılarda grafiği ekran dışına atıyordu.
  const span = Math.max(
    4,
    ...solution.roots.map((r) => Math.abs(r - vertexX) * 2.6),
  );
  const xMin = vertexX - span;
  const xMax = vertexX + span;

  const f = (x: number) => a * x * x + b * x + c;
  const samples = Array.from({ length: 121 }, (_, i) => {
    const x = xMin + ((xMax - xMin) * i) / 120;
    return { x, y: f(x) };
  });
  const yVals = samples.map((p) => p.y);
  const yMin = Math.min(...yVals, 0);
  const yMax = Math.max(...yVals, 0);

  const W = 460;
  const H = 260;
  const PAD = 28;
  const px = (x: number) =>
    Math.round((PAD + ((x - xMin) / (xMax - xMin)) * (W - PAD * 2)) * 100) / 100;
  const py = (y: number) =>
    Math.round((H - PAD - ((y - yMin) / Math.max(yMax - yMin, 1e-9)) * (H - PAD * 2)) * 100) /
    100;

  const path = samples
    .map((p, i) => `${i ? "L" : "M"}${px(p.x)},${py(p.y)}`)
    .join(" ");

  return (
    <ToolShell
      title="Denklem çözücü"
      subject="Matematik"
      summary="ax² + bx + c = 0 — kökleri, diskriminantı ve parabolü birlikte gör."
      inputs={
        <>
          <ToolNumber label="a" value={a} onChange={setA} hint="0 olursa denklem birinci dereceye düşer." />
          <ToolNumber label="b" value={b} onChange={setB} />
          <ToolNumber label="c" value={c} onChange={setC} />
        </>
      }
      result={
        <>
          <span className="tool-result-label">
            {a}x² {b >= 0 ? "+" : "−"} {Math.abs(b)}x {c >= 0 ? "+" : "−"}{" "}
            {Math.abs(c)} = 0
          </span>
          <strong className="tool-result-value">{solution.text}</strong>
          <span className="tool-result-note">{describe(solution.kind)}</span>
        </>
      }
    >
      <ToolSteps
        rows={[
          {
            label: "Diskriminant Δ = b² − 4ac",
            value: Number.isFinite(solution.disc) ? String(round(solution.disc)) : "—",
          },
          {
            label: "Tepe noktası",
            value: a !== 0 ? `(${round(vertexX)}, ${round(vertexY)})` : "—",
          },
          {
            label: "Simetri ekseni",
            value: a !== 0 ? `x = ${round(vertexX)}` : "—",
          },
          { label: "Kökler toplamı", value: a !== 0 ? String(round(-b / a)) : "—" },
          { label: "Kökler çarpımı", value: a !== 0 ? String(round(c / a)) : "—" },
        ]}
      />

      {a !== 0 ? (
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="tool-chart"
          role="img"
          aria-label={`Parabol, ${solution.text}`}
        >
          {yMin < 0 && yMax > 0 ? (
            <line x1={PAD} x2={W - PAD} y1={py(0)} y2={py(0)} stroke="#4a4a4a" strokeWidth="1" />
          ) : null}
          {xMin < 0 && xMax > 0 ? (
            <line x1={px(0)} x2={px(0)} y1={PAD} y2={H - PAD} stroke="#4a4a4a" strokeWidth="1" />
          ) : null}

          <path d={path} fill="none" stroke="#f4ae0b" strokeWidth="2.5" />

          {solution.roots.map((r) => (
            <g key={r}>
              <circle cx={px(r)} cy={py(0)} r="5" fill="#54c594" />
              <text x={px(r)} y={py(0) - 12} textAnchor="middle" className="tool-axis" fill="#54c594">
                {round(r)}
              </text>
            </g>
          ))}

          <circle cx={px(vertexX)} cy={py(vertexY)} r="4" fill="#7aa2f7" />
        </svg>
      ) : null}
    </ToolShell>
  );
}

function describe(kind: string): string {
  if (kind === "iki") return "Δ > 0 — parabol ekseni iki noktada kesiyor.";
  if (kind === "cift") return "Δ = 0 — parabol eksene teğet, kök çakışık.";
  if (kind === "karmasik") return "Δ < 0 — parabol ekseni kesmiyor, kökler karmaşık.";
  if (kind === "dogrusal") return "a = 0 olduğu için denklem birinci derece.";
  if (kind === "sonsuz") return "Bütün katsayılar sıfır — her x denklemi sağlıyor.";
  return "a = b = 0 ama c ≠ 0 — hiçbir x denklemi sağlamıyor.";
}
