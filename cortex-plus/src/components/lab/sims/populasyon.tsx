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
 * Popülasyon dinamiği.
 *
 * Üstel büyüme sezgiye aykırı çünkü grafiğin başı düz görünüyor: öğrenci
 * "yavaş artıyor" diye okuyup sonraki patlamayı beklemiyor. Bu yüzden
 * üstel ve lojistik yan yana; taşıma kapasitesi çizgisi de duruyor.
 *
 * Lojistik model gerçek popülasyonların neden sonsuza gitmediğini
 * anlatıyor — kaynak sınırı. İkisini aynı ekranda görmek, modelin
 * varsayımının sonucu nasıl belirlediğini gösteriyor.
 */

type Model = "ustel" | "lojistik" | "ikisi";

export function PopulasyonLab() {
  const [n0, setN0] = useState(20);
  const [rate, setRate] = useState(0.4);
  const [capacity, setCapacity] = useState(1000);
  const [years, setYears] = useState(30);
  const [model, setModel] = useState<Model>("ikisi");

  const data = useMemo(() => {
    const steps = 120;
    return Array.from({ length: steps + 1 }, (_, i) => {
      const t = (i / steps) * years;
      const exp = n0 * Math.exp(rate * t);
      // Lojistik kapalı çözüm: sayısal adım yerine tam formül.
      const log =
        (capacity * n0) / (n0 + (capacity - n0) * Math.exp(-rate * t));
      return { t, exp, log };
    });
  }, [n0, rate, capacity, years]);

  const finalExp = data[data.length - 1].exp;
  const finalLog = data[data.length - 1].log;
  const doubling = Math.LN2 / rate;
  // Lojistikte en hızlı büyüme kapasitenin yarısında olur.
  const inflection =
    n0 < capacity / 2 ? Math.log((capacity - n0) / n0) / rate : 0;

  const W = 540;
  const H = 260;
  const PAD = 42;
  const showExp = model !== "lojistik";
  const yMax = showExp
    ? Math.min(Math.max(finalExp, capacity * 1.2), capacity * 6)
    : capacity * 1.15;

  const px = (t: number) => r2(PAD + (t / years) * (W - PAD * 2));
  const py = (v: number) => r2(H - PAD - (Math.min(v, yMax) / yMax) * (H - PAD * 2));

  const line = (key: "exp" | "log") =>
    data
      .filter((p) => p[key] <= yMax * 1.02)
      .map((p, i) => `${i ? "L" : "M"}${px(p.t)},${py(p[key])}`)
      .join(" ");

  return (
    <SimShell
      id="populasyon"
      title="Popülasyon dinamiği"
      subject="Biyoloji"
      summary="Üstel büyümenin başı neden düz görünür?"
      help={{
        intro:
          "Sınırsız kaynak varsayarsak popülasyon üstel büyür. Gerçekte kaynaklar sınırlıdır; lojistik model büyümeyi taşıma kapasitesinde durdurur.",
        steps: [
          "Süreyi uzat — üstel eğrinin başı düz görünürken sonra dikleşiyor.",
          "Taşıma kapasitesini değiştir: lojistik eğri hep ona yaklaşıp duruyor.",
          "İkiye katlanma süresine bak; üstel büyümede bu süre sabittir.",
        ],
        legend: [
          { color: "#f0a08c", label: "Üstel" },
          { color: "#54c594", label: "Lojistik" },
          { color: "#7aa2f7", label: "Taşıma kapasitesi" },
        ],
      }}
      controls={
        <>
          <SimSlider label="Başlangıç" value={n0} onChange={setN0} min={2} max={500} step={2} unit=" birey" />
          <SimSlider label="Büyüme oranı r" value={rate} onChange={setRate} min={0.05} max={1.2} step={0.05} format={(v) => v.toFixed(2)} />
          <SimSlider label="Taşıma kapasitesi" value={capacity} onChange={setCapacity} min={100} max={5000} step={100} />
          <SimSlider label="Süre" value={years} onChange={setYears} min={5} max={60} unit=" yıl" />
          <SimChips
            label="Model"
            value={model}
            options={[
              { id: "ikisi" as Model, label: "İkisi" },
              { id: "ustel" as Model, label: "Üstel" },
              { id: "lojistik" as Model, label: "Lojistik" },
            ]}
            onChange={setModel}
          />
        </>
      }
      readouts={
        <>
          <SimReadout
            label={`${years} yıl sonra`}
            tone="highlight"
            rows={[
              { label: "Lojistik", value: Math.round(finalLog).toLocaleString("tr-TR") },
              { label: "Üstel", value: Math.round(finalExp).toLocaleString("tr-TR") },
            ]}
          />
          <SimReadout
            label="İkiye katlanma"
            tone="accent"
            rows={[
              { label: "Süre", value: `${doubling.toFixed(1)} yıl` },
              { label: "Üstelde sabit mi", value: "evet" },
            ]}
          />
          <SimReadout
            label="En hızlı büyüme"
            rows={[
              {
                label: "Zaman",
                value: inflection > 0 ? `${inflection.toFixed(1)}. yıl` : "başlangıçta",
              },
              { label: "Nüfus", value: Math.round(capacity / 2).toLocaleString("tr-TR") },
            ]}
          />
          <SimReadout
            label="Kapasiteye oran"
            rows={[
              { label: "Doluluk", value: `%${((finalLog / capacity) * 100).toFixed(1)}` },
              { label: "Kapasite", value: capacity.toLocaleString("tr-TR") },
            ]}
          />
        </>
      }
    >
      <PredictGate
        question={`${n0} bireyle başlayan bir popülasyon, r = ${rate.toFixed(2)} ile ${years} yıl sonra lojistik modelde kaç bireye ulaşır?`}
        hint={`Taşıma kapasitesi ${capacity}. Onu aşamaz.`}
        actual={finalLog}
        format={(v) => Math.round(v).toLocaleString("tr-TR")}
        tolerance={0.2}
      />

      <svg viewBox={`0 0 ${W} ${H}`} className="sim-chart" role="img" aria-label={`Lojistik ${Math.round(finalLog)}, üstel ${Math.round(finalExp)}`}>
        <line x1={PAD} x2={W - PAD} y1={py(0)} y2={py(0)} stroke="#4a4a4a" strokeWidth="1" />
        <line x1={PAD} x2={PAD} y1={PAD - 10} y2={py(0)} stroke="#4a4a4a" strokeWidth="1" />

        {/* Taşıma kapasitesi */}
        {model !== "ustel" ? (
          <>
            <line x1={PAD} x2={W - PAD} y1={py(capacity)} y2={py(capacity)} stroke="#7aa2f7" strokeWidth="1.5" strokeDasharray="6 4" />
            <text x={W - PAD} y={py(capacity) - 6} textAnchor="end" className="sim-axis" fill="#7aa2f7">
              K = {capacity}
            </text>
          </>
        ) : null}

        {showExp ? <path d={line("exp")} fill="none" stroke="#f0a08c" strokeWidth="2.5" /> : null}
        {model !== "ustel" ? <path d={line("log")} fill="none" stroke="#54c594" strokeWidth="2.5" /> : null}

        <text x={PAD} y={H - 12} className="sim-axis">0</text>
        <text x={W - PAD} y={H - 12} textAnchor="end" className="sim-axis">{years} yıl</text>
      </svg>
    </SimShell>
  );
}
