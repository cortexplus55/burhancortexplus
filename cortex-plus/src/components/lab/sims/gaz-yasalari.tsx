"use client";

import { useMemo, useState } from "react";
import { PredictGate } from "@/components/lab/predict-gate";
import {
  SimChips,
  SimReadout,
  SimShell,
  SimSlider,
  r2,
} from "@/components/lab/sim-shell";

/**
 * Gaz yasaları.
 *
 * PV = nRT tek denklem ama öğrenci Boyle, Charles ve Gay-Lussac'ı ayrı üç
 * kural gibi ezberliyor. Burada hangi değişkenin SABİT tutulacağı seçiliyor
 * ve grafik ona göre şekil değiştiriyor: aynı denklemin üç yüzü olduğu
 * böyle görünüyor.
 *
 * Sıcaklık kelvin. Santigrat kullansaydık Charles yasasının doğrusu
 * orijinden geçmezdi ve "hacim sıcaklıkla orantılı" cümlesi yanlış görünürdü.
 */

type Law = "boyle" | "charles" | "gaylussac";

const R = 8.314; // J/(mol·K)

const LAWS: { id: Law; label: string; fixed: string; x: string; y: string }[] = [
  { id: "boyle", label: "Boyle", fixed: "T sabit", x: "Hacim (L)", y: "Basınç (kPa)" },
  { id: "charles", label: "Charles", fixed: "P sabit", x: "Sıcaklık (K)", y: "Hacim (L)" },
  { id: "gaylussac", label: "Gay-Lussac", fixed: "V sabit", x: "Sıcaklık (K)", y: "Basınç (kPa)" },
];

export function GazYasalariLab() {
  const [law, setLaw] = useState<Law>("boyle");
  const [n, setN] = useState(1);
  const [temp, setTemp] = useState(300);
  const [volume, setVolume] = useState(20);
  const [pressure, setPressure] = useState(125);

  // Seçilen yasada bağımlı değişken hesaplanıyor, diğer ikisi girdi.
  const current = useMemo(() => {
    if (law === "boyle") {
      // P = nRT/V, kPa cinsinden (V litre → m³)
      const p = (n * R * temp) / (volume / 1000) / 1000;
      return { x: volume, y: p };
    }
    if (law === "charles") {
      const v = ((n * R * temp) / (pressure * 1000)) * 1000;
      return { x: temp, y: v };
    }
    const p = (n * R * temp) / (volume / 1000) / 1000;
    return { x: temp, y: p };
  }, [law, n, temp, volume, pressure]);

  const curve = useMemo(() => {
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= 60; i++) {
      if (law === "boyle") {
        const v = 2 + (i / 60) * 58;
        pts.push({ x: v, y: (n * R * temp) / (v / 1000) / 1000 });
      } else if (law === "charles") {
        const t = 50 + (i / 60) * 550;
        pts.push({ x: t, y: ((n * R * t) / (pressure * 1000)) * 1000 });
      } else {
        const t = 50 + (i / 60) * 550;
        pts.push({ x: t, y: (n * R * t) / (volume / 1000) / 1000 });
      }
    }
    return pts;
  }, [law, n, temp, volume, pressure]);

  const W = 540;
  const H = 260;
  const PAD = 40;
  const xs = curve.map((p) => p.x);
  const ys = curve.map((p) => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMax = Math.max(...ys) * 1.05;

  const px = (x: number) => r2(PAD + ((x - xMin) / (xMax - xMin)) * (W - PAD * 2));
  const py = (y: number) => r2(H - PAD - (y / yMax) * (H - PAD * 2));
  const d = curve.map((p, i) => `${i ? "L" : "M"}${px(p.x)},${py(p.y)}`).join(" ");

  const meta = LAWS.find((l) => l.id === law)!;

  return (
    <SimShell
      id="gaz-yasalari"
      title="Gaz yasaları"
      subject="Kimya"
      summary="Boyle, Charles, Gay-Lussac — hepsi tek denklemin yüzleri."
      help={{
        intro:
          "İdeal gaz denklemi PV = nRT. Üç klasik yasa bu denklemde bir değişkeni sabit tutmaktan başka bir şey değil; ayrı kurallar değiller.",
        steps: [
          "Boyle: sıcaklık sabit, basınç hacimle ters orantılı — eğri hiperbol.",
          "Charles: basınç sabit, hacim sıcaklıkla doğru orantılı — doğru, orijinden geçiyor.",
          "Gay-Lussac: hacim sabit, basınç sıcaklıkla doğru orantılı.",
        ],
        legend: [{ color: "#f4ae0b", label: "PV = nRT" }],
      }}
      controls={
        <>
          <SimChips
            label="Sabit tutulan"
            value={law}
            options={LAWS.map((l) => ({ id: l.id, label: `${l.label} · ${l.fixed}` }))}
            onChange={setLaw}
          />
          <SimSlider label="Mol sayısı n" value={n} onChange={setN} min={0.5} max={5} step={0.5} format={(v) => v.toFixed(1)} />
          {law !== "charles" ? (
            <SimSlider label="Sıcaklık" value={temp} onChange={setTemp} min={100} max={600} step={10} unit=" K" />
          ) : (
            <SimSlider label="Basınç" value={pressure} onChange={setPressure} min={20} max={400} step={5} unit=" kPa" />
          )}
          {law === "boyle" || law === "gaylussac" ? (
            <SimSlider label="Hacim" value={volume} onChange={setVolume} min={2} max={60} step={1} unit=" L" />
          ) : (
            <SimSlider label="Sıcaklık" value={temp} onChange={setTemp} min={100} max={600} step={10} unit=" K" />
          )}
        </>
      }
      readouts={
        <>
          <SimReadout
            label={meta.y.split(" ")[0]}
            tone="highlight"
            rows={[
              { label: "Değer", value: current.y.toFixed(1) },
              { label: "Birim", value: meta.y.includes("kPa") ? "kPa" : "L" },
            ]}
          />
          <SimReadout
            label="Sabit tutulan"
            tone="accent"
            rows={[
              { label: meta.fixed, value: law === "boyle" ? `${temp} K` : law === "charles" ? `${pressure} kPa` : `${volume} L` },
              { label: "Mol", value: `${n.toFixed(1)} mol` },
            ]}
          />
          <SimReadout
            label="PV / nT"
            rows={[
              {
                label: "Hesaplanan",
                value: (
                  (law === "charles"
                    ? pressure * 1000 * (current.y / 1000)
                    : current.y * 1000 * (volume / 1000)) /
                  (n * (law === "boyle" ? temp : law === "charles" ? current.x : current.x))
                ).toFixed(3),
              },
              { label: "R (beklenen)", value: R.toFixed(3) },
            ]}
          />
        </>
      }
    >
      <PredictGate
        question={`${meta.label} koşullarında ${meta.y.toLowerCase()} kaç olur?`}
        hint={`${meta.fixed}. PV = nRT.`}
        actual={current.y}
        format={(v) => v.toFixed(1)}
        tolerance={0.2}
      />

      <svg viewBox={`0 0 ${W} ${H}`} className="sim-chart" role="img" aria-label={`${meta.label} eğrisi`}>
        <line x1={PAD} x2={W - PAD} y1={py(0)} y2={py(0)} stroke="#4a4a4a" strokeWidth="1" />
        <line x1={PAD} x2={PAD} y1={PAD - 10} y2={py(0)} stroke="#4a4a4a" strokeWidth="1" />

        <path d={d} fill="none" stroke="#f4ae0b" strokeWidth="2.5" />
        <circle cx={px(current.x)} cy={py(current.y)} r="5" fill="#f4ae0b" />
        <line
          x1={px(current.x)}
          x2={px(current.x)}
          y1={py(current.y)}
          y2={py(0)}
          stroke="#f4ae0b"
          strokeWidth="1"
          strokeDasharray="3 3"
          opacity="0.5"
        />

        <text x={PAD} y={H - 12} className="sim-axis">{meta.x}</text>
        <text x={W - PAD} y={H - 12} textAnchor="end" className="sim-axis">{xMax.toFixed(0)}</text>
        <text x={PAD - 6} y={PAD} textAnchor="end" className="sim-axis">{yMax.toFixed(0)}</text>
      </svg>
    </SimShell>
  );
}
