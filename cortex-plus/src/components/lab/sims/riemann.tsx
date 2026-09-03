"use client";

import { useMemo, useState } from "react";
import { PredictGate } from "@/components/lab/predict-gate";
import {
  SimChips,
  SimReadout,
  SimShell,
  SimSlider,
} from "@/components/lab/sim-shell";
import { FnInput } from "@/components/lab/fn-input";
import { Axes, fmt } from "@/components/lab/sims/turev-teget";
import { compile, integrate } from "@/lib/lab/expr";
import { autoRange, curvePaths, makeScale } from "@/lib/lab/plot";

/**
 * Riemann toplamı.
 *
 * İntegralin tanımı "sonsuz ince dikdörtgenlerin toplamı" ama bu cümle
 * kimseye bir şey anlatmıyor. Dikdörtgen sayısını elle artırıp hatanın
 * eridiğini görmek anlatıyor.
 *
 * Sol/sağ/orta seçeneği bilerek var: sol ve sağ toplam gerçek değeri iki
 * yandan sıkıştırıyor, orta nokta ikisinden de hızlı yakınsıyor. Öğrenci
 * "hangisi daha iyi" sorusunu kendi cevaplıyor.
 */

type Mode = "sol" | "orta" | "sag";

export function RiemannLab() {
  const [src, setSrc] = useState("x^2");
  const [a, setA] = useState(0);
  const [b, setB] = useState(3);
  const [n, setN] = useState(6);
  const [mode, setMode] = useState<Mode>("sol");

  const f = useMemo(() => compile(src), [src]);

  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const range = useMemo(
    () => (f ? autoRange(f, lo - 1, hi + 1) : { yMin: -1, yMax: 1 }),
    [f, lo, hi],
  );
  const scale = makeScale(lo - 0.5, hi + 0.5, range.yMin, range.yMax);
  const paths = useMemo(
    () =>
      f ? curvePaths(f, scale, lo - 0.5, hi + 0.5, range.yMin, range.yMax) : [],
    [f, scale, lo, hi, range],
  );

  const bars = useMemo(() => {
    if (!f || hi <= lo) return [];
    const w = (hi - lo) / n;
    return Array.from({ length: n }, (_, i) => {
      const left = lo + i * w;
      const sampleX =
        mode === "sol" ? left : mode === "sag" ? left + w : left + w / 2;
      return { left, w, y: f(sampleX), sampleX };
    });
  }, [f, lo, hi, n, mode]);

  if (!f) {
    return (
      <SimShell
        id="riemann"
        title="Riemann toplamı"
        subject="Matematik"
        summary="İntegral neden dikdörtgenlerin toplamı?"
        help={{ intro: "Bir fonksiyon yaz.", steps: ["Örnek: x^2, sin(x)"] }}
        controls={<FnInput value={src} onChange={setSrc} />}
      >
        <p className="sim-error">Bu ifadeyi anlayamadım.</p>
      </SimShell>
    );
  }

  const approx = bars.reduce((s, bar) => s + bar.y * bar.w, 0);
  const exact = integrate(f, lo, hi);
  const error = approx - exact;

  return (
    <SimShell
      id="riemann"
      title="Riemann toplamı"
      subject="Matematik"
      summary="Dikdörtgen sayısını artır, hatanın eridiğini gör."
      help={{
        intro:
          "Bir eğrinin altındaki alanı dikdörtgenlerle doldururuz. Dikdörtgen inceldikçe toplam gerçek alana yaklaşır; integral bu yaklaşmanın limitidir.",
        steps: [
          "Dikdörtgen sayısını artır — hata hızla küçülür.",
          "Sol ve sağ toplamı karşılaştır: artan bir fonksiyonda biri eksik, biri fazla tahmin eder.",
          "Orta noktayı dene; aynı sayıda dikdörtgenle çok daha az hata verir.",
        ],
        legend: [
          { color: "#f4ae0b", label: "f(x)" },
          { color: "#7aa2f7", label: "Dikdörtgenler" },
        ],
      }}
      controls={
        <>
          <FnInput value={src} onChange={setSrc} />
          <SimSlider label="Alt sınır a" value={a} onChange={setA} min={-5} max={5} step={0.5} format={(v) => v.toFixed(1)} />
          <SimSlider label="Üst sınır b" value={b} onChange={setB} min={-5} max={5} step={0.5} format={(v) => v.toFixed(1)} />
          <SimSlider label="Dikdörtgen sayısı" value={n} onChange={setN} min={1} max={80} />
          <SimChips
            label="Örnekleme noktası"
            value={mode}
            options={[
              { id: "sol" as Mode, label: "Sol" },
              { id: "orta" as Mode, label: "Orta" },
              { id: "sag" as Mode, label: "Sağ" },
            ]}
            onChange={setMode}
          />
        </>
      }
      readouts={
        <>
          <SimReadout
            label="Yaklaşık toplam"
            tone="accent"
            rows={[
              { label: `${n} dikdörtgen`, value: fmt(approx) },
              { label: "Genişlik", value: fmt((hi - lo) / n) },
            ]}
          />
          <SimReadout
            label="Gerçek integral"
            tone="highlight"
            rows={[
              { label: "∫ f(x) dx", value: fmt(exact) },
              { label: "Aralık", value: `[${lo}, ${hi}]` },
            ]}
          />
          <SimReadout
            label="Hata"
            rows={[
              { label: "Fark", value: fmt(error) },
              {
                label: "Oran",
                value:
                  Math.abs(exact) > 1e-9
                    ? `%${Math.abs((error / exact) * 100).toFixed(2)}`
                    : "—",
              },
            ]}
          />
        </>
      }
    >
      <PredictGate
        question={`${n} dikdörtgenle ${mode} toplam, gerçek integralden ne kadar sapar?`}
        hint="İşareti de düşün: eksik mi fazla mı tahmin ediyor?"
        actual={error}
        format={fmt}
        tolerance={0.3}
      />

      <svg
        viewBox={`0 0 ${scale.W} ${scale.H}`}
        className="sim-chart"
        role="img"
        aria-label={`Yaklaşık ${fmt(approx)}, gerçek ${fmt(exact)}`}
      >
        <Axes scale={scale} xMin={lo - 0.5} xMax={hi + 0.5} yMin={range.yMin} yMax={range.yMax} />

        {bars.map((bar, i) => {
          const yTop = scale.py(Math.max(bar.y, 0));
          const yBottom = scale.py(Math.min(bar.y, 0));
          return (
            <rect
              key={i}
              x={scale.px(bar.left)}
              y={yTop}
              width={Math.max(scale.px(bar.left + bar.w) - scale.px(bar.left), 0.5)}
              height={Math.max(yBottom - yTop, 0)}
              fill="rgba(122,162,247,0.28)"
              stroke="#7aa2f7"
              strokeWidth="0.75"
            />
          );
        })}

        {paths.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="#f4ae0b" strokeWidth="2.5" />
        ))}
      </svg>
    </SimShell>
  );
}
