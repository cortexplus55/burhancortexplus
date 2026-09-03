"use client";

import { useMemo, useState } from "react";
import { PredictGate } from "@/components/lab/predict-gate";
import {
  SimReadout,
  SimShell,
  SimSlider,
  r2,
} from "@/components/lab/sim-shell";

/**
 * Serbest düşüş ve hava direnci.
 *
 * "Ağır cisim daha hızlı düşer" yanılgısı hava direncinden geliyor —
 * boşlukta tüy de çekiç de aynı anda düşer. Bu simülasyon iki cismi yan
 * yana bırakıyor: biri hava direnciyle, biri boşlukta. Fark gözle görülüyor.
 *
 * Model: sürükleme kuvveti hıza karesiyle bağlı (F = ½ρCdAv²). Terminal hız
 * kapalı formülden, yörünge Euler adımıyla. Adım küçük tutuldu; öğrenciye
 * gösterilecek doğrulukta.
 */

const G = 9.81;
const RHO = 1.225; // hava yoğunluğu, deniz seviyesi

export function SerbestDususLab() {
  const [mass, setMass] = useState(1);
  const [area, setArea] = useState(0.05);
  const [drag, setDrag] = useState(0.5);
  const [height, setHeight] = useState(100);

  const k = 0.5 * RHO * drag * area;
  const terminal = Math.sqrt((mass * G) / Math.max(k, 1e-9));

  const sim = useMemo(() => {
    const dt = 0.005;
    let v = 0;
    let y = 0;
    const withAir: { t: number; y: number; v: number }[] = [];
    let t = 0;
    // Havayla düşüş: hız arttıkça sürükleme büyür, ivme küçülür.
    while (y < height && t < 120) {
      withAir.push({ t, y, v });
      const acc = G - (k * v * v) / mass;
      v += acc * dt;
      y += v * dt;
      t += dt;
    }
    const airTime = t;
    const vacuumTime = Math.sqrt((2 * height) / G);
    return {
      withAir,
      airTime,
      vacuumTime,
      impactAir: v,
      impactVacuum: G * vacuumTime,
    };
  }, [height, k, mass]);

  const W = 560;
  const H = 250;
  const PAD = 30;
  const maxT = Math.max(sim.airTime, sim.vacuumTime);

  const px = (t: number) => r2(PAD + (t / maxT) * (W - PAD * 2));
  const py = (y: number) => r2(PAD + (y / height) * (H - PAD * 2));

  const airPath = sim.withAir
    .filter((_, i) => i % 4 === 0)
    .map((p, i) => `${i ? "L" : "M"}${px(p.t)},${py(Math.min(p.y, height))}`)
    .join(" ");

  const vacuumPath = Array.from({ length: 61 }, (_, i) => {
    const t = (i / 60) * sim.vacuumTime;
    return `${i ? "L" : "M"}${px(t)},${py(0.5 * G * t * t)}`;
  }).join(" ");

  const delay = sim.airTime - sim.vacuumTime;

  return (
    <SimShell
      id="serbest-dusus"
      title="Serbest düşüş ve hava direnci"
      subject="Fizik"
      summary="Boşlukta tüy de çekiç de aynı anda düşer. Havada ne oluyor?"
      help={{
        intro:
          "Yerçekimi her cisme aynı ivmeyi verir; kütlenin düşüş süresine etkisi yoktur. Farkı yaratan hava direncidir ve o da kütleye değil, cismin şekline ve yüzey alanına bakar.",
        steps: [
          "Kütleyi artır: aynı yüzey alanında ağır cisim havayı daha kolay yarar, süre kısalır.",
          "Yüzey alanını büyüt: paraşüt etkisi — terminal hız düşer.",
          "Sürükleme katsayısını sıfıra yaklaştır; iki eğri üst üste biner.",
        ],
        legend: [
          { color: "#f4ae0b", label: "Hava direnciyle" },
          { color: "#7aa2f7", label: "Boşlukta" },
        ],
      }}
      controls={
        <>
          <SimSlider
            label="Kütle"
            value={mass}
            onChange={setMass}
            min={0.05}
            max={20}
            step={0.05}
            unit=" kg"
            format={(v) => v.toFixed(2)}
          />
          <SimSlider
            label="Yüzey alanı"
            value={area}
            onChange={setArea}
            min={0.01}
            max={2}
            step={0.01}
            unit=" m²"
            format={(v) => v.toFixed(2)}
          />
          <SimSlider
            label="Sürükleme katsayısı"
            value={drag}
            onChange={setDrag}
            min={0}
            max={1.5}
            step={0.05}
            format={(v) => v.toFixed(2)}
          />
          <SimSlider
            label="Düşüş yüksekliği"
            value={height}
            onChange={setHeight}
            min={10}
            max={500}
            step={10}
            unit=" m"
          />
        </>
      }
      readouts={
        <>
          <SimReadout
            label="Hava direnciyle"
            tone="highlight"
            rows={[
              { label: "Süre", value: `${sim.airTime.toFixed(2)} s` },
              { label: "Çarpma hızı", value: `${sim.impactAir.toFixed(1)} m/s` },
            ]}
          />
          <SimReadout
            label="Boşlukta"
            tone="accent"
            rows={[
              { label: "Süre", value: `${sim.vacuumTime.toFixed(2)} s` },
              {
                label: "Çarpma hızı",
                value: `${sim.impactVacuum.toFixed(1)} m/s`,
              },
            ]}
          />
          <SimReadout
            label="Terminal hız"
            rows={[
              {
                label: "Sınır",
                value: k > 1e-6 ? `${terminal.toFixed(1)} m/s` : "yok",
              },
              { label: "Ulaşıldı mı", value: sim.impactAir > terminal * 0.95 ? "evet" : "hayır" },
            ]}
          />
          <SimReadout
            label="Gecikme"
            rows={[
              { label: "Fark", value: `${delay.toFixed(2)} s` },
              {
                label: "Oran",
                value: `%${((delay / sim.vacuumTime) * 100).toFixed(0)}`,
              },
            ]}
          />
        </>
      }
    >
      <PredictGate
        question={`${mass.toFixed(2)} kg, ${area.toFixed(2)} m² yüzeyli bir cisim ${height} m'den düşerse hava direnci onu kaç saniye geciktirir?`}
        hint="Boşlukta düşüş süresi √(2h/g)."
        actual={delay}
        unit=" s"
        format={(v) => v.toFixed(2)}
      />

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="sim-chart"
        role="img"
        aria-label={`Havada ${sim.airTime.toFixed(2)} saniye, boşlukta ${sim.vacuumTime.toFixed(2)} saniye`}
      >
        {/* Zemin en altta: eğriler aşağı doğru gidiyor, düşüş gibi okunsun. */}
        <line
          x1={PAD}
          x2={W - PAD}
          y1={py(height)}
          y2={py(height)}
          stroke="#3a3a3a"
          strokeWidth="1.5"
        />
        <path d={vacuumPath} fill="none" stroke="#7aa2f7" strokeWidth="2.5" />
        <path d={airPath} fill="none" stroke="#f4ae0b" strokeWidth="2.5" />

        <text x={PAD} y={PAD - 10} className="sim-axis">
          Bırakma
        </text>
        <text x={PAD} y={py(height) + 16} className="sim-axis">
          Yer · {height} m
        </text>
        <text x={W - PAD} y={PAD - 10} textAnchor="end" className="sim-axis">
          {maxT.toFixed(1)} s
        </text>
      </svg>
    </SimShell>
  );
}
