"use client";

import { useMemo, useState } from "react";
import { PredictGate } from "@/components/lab/predict-gate";
import { SimReadout, SimShell, SimSlider } from "@/components/lab/sim-shell";
import { FnInput } from "@/components/lab/fn-input";
import { compile, derivative } from "@/lib/lab/expr";
import { autoRange, curvePaths, makeScale } from "@/lib/lab/plot";

/**
 * Türev ve teğet.
 *
 * Türevin tanımı "bir noktadaki eğim" ama öğrenci bunu formül olarak
 * ezberliyor. Burada teğet doğrusu noktayla birlikte kayıyor: eğimin
 * gerçekten değiştiği ve türevin bir SAYI değil bir FONKSİYON olduğu
 * görünür hâle geliyor.
 *
 * Kesen doğru da çiziliyor: h küçüldükçe kesenin teğete yaklaşması,
 * limit tanımının kendisi.
 */

const X_MIN = -5;
const X_MAX = 5;

export function TurevTegetLab() {
  const [src, setSrc] = useState("x^2");
  const [x0, setX0] = useState(1);
  const [h, setH] = useState(1);

  const f = useMemo(() => compile(src), [src]);

  const range = useMemo(
    () => (f ? autoRange(f, X_MIN, X_MAX) : { yMin: -5, yMax: 5 }),
    [f],
  );
  const scale = makeScale(X_MIN, X_MAX, range.yMin, range.yMax);
  const paths = useMemo(
    () => (f ? curvePaths(f, scale, X_MIN, X_MAX, range.yMin, range.yMax) : []),
    [f, scale, range],
  );

  if (!f) {
    return (
      <FnErrorShell src={src} onSrc={setSrc} />
    );
  }

  const y0 = f(x0);
  const slope = derivative(f, x0);
  // Kesen eğimi — h sıfıra giderken teğete yaklaşıyor.
  const secantSlope = (f(x0 + h) - f(x0)) / h;

  const lineAt = (m: number, x: number) => y0 + m * (x - x0);

  return (
    <SimShell
      id="turev-teget"
      title="Türev ve teğet"
      subject="Matematik"
      summary="Türev bir sayı değil, her noktada değişen bir eğim."
      help={{
        intro:
          "Bir fonksiyonun bir noktadaki türevi, o noktadaki teğetin eğimidir. Kesen doğrunun eğimi ise iki nokta arasındaki ortalama değişimdir.",
        steps: [
          "Noktayı kaydır: teğet eğriyle birlikte döner, eğim okunur değişir.",
          "h'yi küçült — kesen doğru teğete yaklaşır. Limit tanımı tam olarak bu.",
          "Kendi fonksiyonunu yaz: x^3-3x, sin(x), 1/x gibi.",
        ],
        legend: [
          { color: "#f4ae0b", label: "f(x)" },
          { color: "#54c594", label: "Teğet" },
          { color: "#7aa2f7", label: "Kesen" },
        ],
      }}
      controls={
        <>
          <FnInput value={src} onChange={setSrc} />
          <SimSlider
            label="Nokta x₀"
            value={x0}
            onChange={setX0}
            min={-4.5}
            max={4.5}
            step={0.1}
            format={(v) => v.toFixed(1)}
          />
          <SimSlider
            label="Kesen aralığı h"
            value={h}
            onChange={setH}
            min={0.05}
            max={3}
            step={0.05}
            format={(v) => v.toFixed(2)}
          />
        </>
      }
      readouts={
        <>
          <SimReadout
            label="Teğetin eğimi"
            tone="highlight"
            rows={[
              { label: "f′(x₀)", value: fmt(slope) },
              { label: "f(x₀)", value: fmt(y0) },
            ]}
          />
          <SimReadout
            label="Kesenin eğimi"
            tone="accent"
            rows={[
              { label: "Ortalama değişim", value: fmt(secantSlope) },
              { label: "Teğetten farkı", value: fmt(secantSlope - slope) },
            ]}
          />
          <SimReadout
            label="Teğet denklemi"
            rows={[
              {
                label: "y =",
                value: `${fmt(slope)}(x − ${x0.toFixed(1)}) + ${fmt(y0)}`,
              },
              { label: "İkinci türev", value: fmt(derivative(f, x0, 2)) },
            ]}
          />
        </>
      }
    >
      <PredictGate
        question={`f(x) = ${src} fonksiyonunun x = ${x0.toFixed(1)} noktasındaki eğimi kaçtır?`}
        hint="Teğetin ne kadar dik olduğunu düşün; sola yatıksa negatif."
        actual={slope}
        format={fmt}
        tolerance={0.2}
      />

      <svg
        viewBox={`0 0 ${scale.W} ${scale.H}`}
        className="sim-chart"
        role="img"
        aria-label={`x = ${x0.toFixed(1)} noktasında eğim ${fmt(slope)}`}
      >
        <Axes
          scale={scale}
          xMin={X_MIN}
          xMax={X_MAX}
          yMin={range.yMin}
          yMax={range.yMax}
        />

        {paths.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="#f4ae0b" strokeWidth="2.5" />
        ))}

        {/* Kesen */}
        <line
          x1={scale.px(X_MIN)}
          y1={scale.py(lineAt(secantSlope, X_MIN))}
          x2={scale.px(X_MAX)}
          y2={scale.py(lineAt(secantSlope, X_MAX))}
          stroke="#7aa2f7"
          strokeWidth="1.5"
          strokeDasharray="5 4"
        />
        {/* Teğet */}
        <line
          x1={scale.px(X_MIN)}
          y1={scale.py(lineAt(slope, X_MIN))}
          x2={scale.px(X_MAX)}
          y2={scale.py(lineAt(slope, X_MAX))}
          stroke="#54c594"
          strokeWidth="2"
        />

        <circle cx={scale.px(x0)} cy={scale.py(y0)} r="5" fill="#54c594" />
        <circle
          cx={scale.px(x0 + h)}
          cy={scale.py(f(x0 + h))}
          r="4"
          fill="#7aa2f7"
        />
      </svg>
    </SimShell>
  );
}

export function Axes({
  scale,
  xMin,
  xMax,
  yMin,
  yMax,
}: {
  scale: { px: (x: number) => number; py: (y: number) => number; W: number; H: number; PAD: number };
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}) {
  const showY = yMin < 0 && yMax > 0;
  const showX = xMin < 0 && xMax > 0;
  return (
    <>
      {showY ? (
        <line
          x1={scale.PAD}
          x2={scale.W - scale.PAD}
          y1={scale.py(0)}
          y2={scale.py(0)}
          stroke="#4a4a4a"
          strokeWidth="1"
        />
      ) : null}
      {showX ? (
        <line
          x1={scale.px(0)}
          x2={scale.px(0)}
          y1={scale.PAD}
          y2={scale.H - scale.PAD}
          stroke="#4a4a4a"
          strokeWidth="1"
        />
      ) : null}
    </>
  );
}

export function fmt(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (Math.abs(v) >= 1000) return v.toExponential(2);
  return (Math.round(v * 1000) / 1000).toString();
}

function FnErrorShell({
  src,
  onSrc,
}: {
  src: string;
  onSrc: (v: string) => void;
}) {
  return (
    <SimShell
      id="turev-teget"
      title="Türev ve teğet"
      subject="Matematik"
      summary="Türev bir sayı değil, her noktada değişen bir eğim."
      help={{
        intro: "Bir fonksiyon yaz, teğetini gör.",
        steps: ["Örnek: x^2, sin(x), x^3-3x"],
      }}
      controls={<FnInput value={src} onChange={onSrc} />}
    >
      <p className="sim-error">
        Bu ifadeyi anlayamadım. Örnek: <code>x^2</code>, <code>sin(x)</code>,{" "}
        <code>x^3-3x</code>
      </p>
    </SimShell>
  );
}
