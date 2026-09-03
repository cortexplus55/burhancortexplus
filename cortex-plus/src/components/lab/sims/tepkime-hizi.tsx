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
 * Tepkime hızı.
 *
 * "Sıcaklık artınca tepkime hızlanır" cümlesi doğru ama ne kadar hızlandığı
 * sezgiye aykırı: Arrhenius bağıntısı üstel, yani 10 derecelik artış hızı
 * iki katına çıkarabiliyor. Burada sıcaklık kaydırıcısı oynatılınca yarı
 * ömrün nasıl çöktüğü görülüyor.
 *
 * Derece seçilebiliyor (0, 1, 2) çünkü öğrenci genelde her tepkimeyi
 * birinci derece sanıyor; derişim-zaman eğrisinin şekli dereceyle
 * değişiyor ve bu ayrım grafikte hemen okunuyor.
 */

const R = 8.314;

export function TepkimeHiziLab() {
  const [ea, setEa] = useState(50); // kJ/mol
  const [temp, setTemp] = useState(300);
  const [c0, setC0] = useState(1);
  const [order, setOrder] = useState("1");

  // Öncel çarpan sabit tutuluyor: amaç mutlak hız değil, değişimin oranı.
  const A = 1e9;
  const k = A * Math.exp((-ea * 1000) / (R * temp));

  const n = Number(order);

  const halfLife = useMemo(() => {
    if (n === 0) return c0 / (2 * k);
    if (n === 1) return Math.LN2 / k;
    return 1 / (k * c0);
  }, [n, k, c0]);

  const conc = useMemo(() => {
    // Grafik penceresini yarı ömre göre ölçekle; sabit pencere ya boş ya
    // dolu görünüyordu.
    const tEnd = Math.min(Math.max(halfLife * 4, 1e-6), 1e9);
    return Array.from({ length: 121 }, (_, i) => {
      const t = (i / 120) * tEnd;
      let c: number;
      if (n === 0) c = Math.max(c0 - k * t, 0);
      else if (n === 1) c = c0 * Math.exp(-k * t);
      else c = c0 / (1 + k * c0 * t);
      return { t, c };
    });
  }, [n, k, c0, halfLife]);

  const W = 540;
  const H = 250;
  const PAD = 38;
  const tEnd = conc[conc.length - 1].t;
  const px = (t: number) => r2(PAD + (t / Math.max(tEnd, 1e-12)) * (W - PAD * 2));
  const py = (c: number) => r2(H - PAD - (c / Math.max(c0, 1e-12)) * (H - PAD * 2));
  const d = conc.map((p, i) => `${i ? "L" : "M"}${px(p.t)},${py(p.c)}`).join(" ");

  // 10 derece artışın etkisi — kuralın kendisi bu sayıda görünür.
  const k10 = A * Math.exp((-ea * 1000) / (R * (temp + 10)));
  const speedup = k10 / k;

  return (
    <SimShell
      id="tepkime-hizi"
      title="Tepkime hızı"
      subject="Kimya"
      summary="10 derece neden hızı ikiye katlıyor?"
      help={{
        intro:
          "Hız sabiti sıcaklıkla üstel artar (Arrhenius). Bu yüzden küçük bir sıcaklık artışı hızı çarpıcı biçimde değiştirir. Aktivasyon enerjisi büyüdükçe bu duyarlılık da büyür.",
        steps: [
          "Sıcaklığı 10 derece artır — sağdaki 'hızlanma' kartına bak.",
          "Aktivasyon enerjisini büyüt: aynı 10 derece çok daha fazla hızlandırır.",
          "Dereceyi değiştir — derişim eğrisinin şekli tamamen farklılaşır.",
        ],
        legend: [{ color: "#f4ae0b", label: "Derişim" }],
      }}
      controls={
        <>
          <SimSlider label="Aktivasyon enerjisi" value={ea} onChange={setEa} min={10} max={150} step={5} unit=" kJ/mol" />
          <SimSlider label="Sıcaklık" value={temp} onChange={setTemp} min={250} max={500} step={5} unit=" K" />
          <SimSlider label="Başlangıç derişimi" value={c0} onChange={setC0} min={0.1} max={3} step={0.1} unit=" M" format={(v) => v.toFixed(1)} />
          <SimChips
            label="Tepkime derecesi"
            value={order}
            options={[
              { id: "0", label: "0. derece" },
              { id: "1", label: "1. derece" },
              { id: "2", label: "2. derece" },
            ]}
            onChange={setOrder}
          />
        </>
      }
      readouts={
        <>
          <SimReadout
            label="Hız sabiti"
            tone="accent"
            rows={[
              { label: "k", value: k.toExponential(3) },
              { label: "Birim", value: n === 1 ? "1/s" : n === 0 ? "M/s" : "1/(M·s)" },
            ]}
          />
          <SimReadout
            label="Yarı ömür"
            tone="highlight"
            rows={[
              { label: "t½", value: formatTime(halfLife) },
              { label: "Derişime bağlı mı", value: n === 1 ? "hayır" : "evet" },
            ]}
          />
          <SimReadout
            label="+10 K etkisi"
            rows={[
              { label: "Hızlanma", value: `${speedup.toFixed(2)}×` },
              { label: "Yeni t½", value: formatTime(halfLife / speedup) },
            ]}
          />
        </>
      }
    >
      <PredictGate
        question={`Sıcaklığı ${temp} K'den ${temp + 10} K'e çıkarırsan tepkime kaç kat hızlanır?`}
        hint={`Aktivasyon enerjisi ${ea} kJ/mol. Arrhenius üstel.`}
        actual={speedup}
        unit="×"
        format={(v) => v.toFixed(2)}
        tolerance={0.15}
      />

      <svg viewBox={`0 0 ${W} ${H}`} className="sim-chart" role="img" aria-label={`Yarı ömür ${formatTime(halfLife)}`}>
        <line x1={PAD} x2={W - PAD} y1={py(0)} y2={py(0)} stroke="#4a4a4a" strokeWidth="1" />
        <line x1={PAD} x2={PAD} y1={PAD - 8} y2={py(0)} stroke="#4a4a4a" strokeWidth="1" />

        {/* Yarı ömür çizgisi — grafiğin okunmasını kolaylaştırıyor. */}
        <line x1={PAD} x2={W - PAD} y1={py(c0 / 2)} y2={py(c0 / 2)} stroke="#7aa2f7" strokeWidth="1" strokeDasharray="4 4" opacity="0.6" />
        <line x1={px(halfLife)} x2={px(halfLife)} y1={PAD - 8} y2={py(0)} stroke="#7aa2f7" strokeWidth="1" strokeDasharray="4 4" opacity="0.6" />

        <path d={d} fill="none" stroke="#f4ae0b" strokeWidth="2.5" />

        <text x={PAD} y={H - 10} className="sim-axis">0</text>
        <text x={W - PAD} y={H - 10} textAnchor="end" className="sim-axis">{formatTime(tEnd)}</text>
        <text x={PAD - 6} y={py(c0) + 4} textAnchor="end" className="sim-axis">{c0.toFixed(1)}</text>
        <text x={px(halfLife) + 5} y={PAD} className="sim-axis" fill="#7aa2f7">t½</text>
      </svg>
    </SimShell>
  );
}

/** Yarı ömür saniyeden yıllara kadar değişiyor; sabit birim okunmaz oluyor. */
function formatTime(s: number): string {
  if (!Number.isFinite(s)) return "—";
  if (s < 1e-3) return `${(s * 1e6).toFixed(1)} µs`;
  if (s < 1) return `${(s * 1000).toFixed(1)} ms`;
  if (s < 60) return `${s.toFixed(1)} s`;
  if (s < 3600) return `${(s / 60).toFixed(1)} dk`;
  if (s < 86400) return `${(s / 3600).toFixed(1)} sa`;
  if (s < 3.15e7) return `${(s / 86400).toFixed(1)} gün`;
  return `${(s / 3.15e7).toExponential(2)} yıl`;
}
