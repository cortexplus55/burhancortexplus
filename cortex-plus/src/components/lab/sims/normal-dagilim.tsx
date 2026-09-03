"use client";

import { useMemo, useState } from "react";
import { PredictGate } from "@/components/lab/predict-gate";
import { SimReadout, SimShell, SimSlider, r2 } from "@/components/lab/sim-shell";

/**
 * Normal dağılım.
 *
 * 68-95-99,7 kuralı ezberleniyor ama nereden geldiği bilinmiyor. Burada
 * ±1σ, ±2σ, ±3σ bantları eğrinin altında ayrı ayrı taralı ve her birinin
 * yüzdesi yanında; kural görsel olarak okunuyor.
 *
 * Ortalama ve standart sapma ayrı kaydırıcılar: ortalama eğriyi kaydırıyor,
 * sapma yayıyor. Öğrencilerin çoğu ikisini karıştırıyor, ayrı oynatmak
 * farkı netleştiriyor.
 */

const W = 560;
const H = 280;
const PAD = 36;

/** Standart normal birikimli dağılım — Abramowitz-Stegun yaklaşımı. */
function phi(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p =
    d *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

export function NormalDagilimLab() {
  const [mean, setMean] = useState(100);
  const [sd, setSd] = useState(15);
  const [lower, setLower] = useState(85);
  const [upper, setUpper] = useState(115);

  const xMin = mean - 4 * sd;
  const xMax = mean + 4 * sd;

  const pdf = (x: number) =>
    Math.exp(-0.5 * Math.pow((x - mean) / sd, 2)) / (sd * Math.sqrt(2 * Math.PI));

  const peak = pdf(mean);

  const px = (x: number) => r2(PAD + ((x - xMin) / (xMax - xMin)) * (W - PAD * 2));
  const py = (y: number) => r2(H - PAD - (y / (peak * 1.12)) * (H - PAD * 2));

  const curve = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i <= 240; i++) {
      const x = xMin + ((xMax - xMin) * i) / 240;
      pts.push(`${i ? "L" : "M"}${px(x)},${py(pdf(x))}`);
    }
    return pts.join(" ");
  }, [mean, sd]);

  const band = (from: number, to: number) => {
    const pts: string[] = [`M${px(from)},${py(0)}`];
    for (let i = 0; i <= 60; i++) {
      const x = from + ((to - from) * i) / 60;
      pts.push(`L${px(x)},${py(pdf(x))}`);
    }
    pts.push(`L${px(to)},${py(0)} Z`);
    return pts.join(" ");
  };

  const zLo = (lower - mean) / sd;
  const zHi = (upper - mean) / sd;
  const between = phi(zHi) - phi(zLo);

  return (
    <SimShell
      id="normal-dagilim"
      title="Normal dağılım"
      subject="Matematik"
      summary="68-95-99,7 kuralı nereden geliyor?"
      help={{
        intro:
          "Normal dağılımda verilerin çoğu ortalamanın çevresinde toplanır. Ortalamadan bir standart sapma uzaklıkta verilerin yaklaşık %68'i, iki sapmada %95'i, üç sapmada %99,7'si bulunur.",
        steps: [
          "Standart sapmayı büyüt — eğri yayılır ama bantların yüzdeleri değişmez.",
          "Ortalamayı kaydır: eğri yer değiştirir, şekli aynı kalır.",
          "Alt ve üst sınırı oynatarak herhangi bir aralığın olasılığını oku.",
        ],
        legend: [
          { color: "#f4ae0b", label: "±1σ · %68" },
          { color: "#7aa2f7", label: "±2σ · %95" },
          { color: "#54c594", label: "Seçilen aralık" },
        ],
      }}
      controls={
        <>
          <SimSlider label="Ortalama μ" value={mean} onChange={setMean} min={50} max={150} step={1} />
          <SimSlider label="Standart sapma σ" value={sd} onChange={setSd} min={5} max={30} step={1} />
          <SimSlider label="Alt sınır" value={lower} onChange={setLower} min={20} max={180} step={1} />
          <SimSlider label="Üst sınır" value={upper} onChange={setUpper} min={20} max={180} step={1} />
        </>
      }
      readouts={
        <>
          <SimReadout
            label="Seçilen aralık"
            tone="highlight"
            rows={[
              { label: `${lower} – ${upper}`, value: `%${(between * 100).toFixed(2)}` },
              { label: "z aralığı", value: `${zLo.toFixed(2)} … ${zHi.toFixed(2)}` },
            ]}
          />
          <SimReadout
            label="Sigma kuralı"
            tone="accent"
            rows={[
              { label: "±1σ", value: `%${((phi(1) - phi(-1)) * 100).toFixed(1)}` },
              { label: "±2σ", value: `%${((phi(2) - phi(-2)) * 100).toFixed(1)}` },
            ]}
          />
          <SimReadout
            label="±3σ"
            rows={[
              { label: "Kapsam", value: `%${((phi(3) - phi(-3)) * 100).toFixed(1)}` },
              { label: "Dışında kalan", value: `%${((1 - (phi(3) - phi(-3))) * 100).toFixed(2)}` },
            ]}
          />
          <SimReadout
            label="Sınırlar"
            rows={[
              { label: "μ ± σ", value: `${mean - sd} – ${mean + sd}` },
              { label: "μ ± 2σ", value: `${mean - 2 * sd} – ${mean + 2 * sd}` },
            ]}
          />
        </>
      }
    >
      <PredictGate
        question={`Ortalaması ${mean}, standart sapması ${sd} olan bir dağılımda değerlerin yüzde kaçı ${lower} ile ${upper} arasındadır?`}
        hint="Sınırların ortalamadan kaç sapma uzakta olduğuna bak."
        actual={between * 100}
        unit="%"
        format={(v) => v.toFixed(1)}
        tolerance={0.12}
      />

      <svg viewBox={`0 0 ${W} ${H}`} className="sim-chart" role="img" aria-label={`Aralık olasılığı %${(between * 100).toFixed(1)}`}>
        <path d={band(mean - 2 * sd, mean + 2 * sd)} fill="rgba(122,162,247,0.16)" />
        <path d={band(mean - sd, mean + sd)} fill="rgba(244,174,11,0.22)" />
        <path d={band(Math.min(lower, upper), Math.max(lower, upper))} fill="rgba(84,197,148,0.25)" />

        <path d={curve} fill="none" stroke="#e4e4e7" strokeWidth="2.5" />
        <line x1={PAD} x2={W - PAD} y1={py(0)} y2={py(0)} stroke="#4a4a4a" strokeWidth="1" />

        {/* Sigma çizgileri */}
        {[-3, -2, -1, 0, 1, 2, 3].map((k) => (
          <g key={k}>
            <line
              x1={px(mean + k * sd)}
              x2={px(mean + k * sd)}
              y1={py(pdf(mean + k * sd))}
              y2={py(0)}
              stroke={k === 0 ? "#e4e4e7" : "#5a5a5a"}
              strokeWidth={k === 0 ? 1.5 : 1}
              strokeDasharray={k === 0 ? undefined : "3 3"}
              opacity={0.7}
            />
            <text x={px(mean + k * sd)} y={H - 14} textAnchor="middle" className="sim-axis">
              {k === 0 ? "μ" : `${k > 0 ? "+" : ""}${k}σ`}
            </text>
          </g>
        ))}
      </svg>
    </SimShell>
  );
}
