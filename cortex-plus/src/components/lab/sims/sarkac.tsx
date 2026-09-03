"use client";

import { useEffect, useRef, useState } from "react";
import { PredictGate } from "@/components/lab/predict-gate";
import {
  SimReadout,
  SimShell,
  SimSlider,
  r2,
} from "@/components/lab/sim-shell";

/**
 * Basit sarkaç.
 *
 * Sezgiye en aykırı gelen yer: periyot kütleye bağlı DEĞİL. Öğrencilerin
 * çoğu ağır sarkacın daha yavaş sallanacağını sanıyor. Bu yüzden kütle
 * kaydırıcısı bilerek duruyor — oynatınca periyodun kılı kıpırdamıyor,
 * bunu görmek anlatmaktan iyi.
 *
 * Küçük açı yaklaşımı (T = 2π√(L/g)) yalnızca küçük açılarda geçerli;
 * büyük açıda gerçek periyot uzuyor. İkisi de gösteriliyor, sapma yüzdesiyle.
 */

const G = 9.81;

export function SarkacLab() {
  const [length, setLength] = useState(1);
  const [angle, setAngle] = useState(20);
  const [mass, setMass] = useState(1);
  const [running, setRunning] = useState(true);
  const [t, setT] = useState(0);
  const raf = useRef<number | null>(null);
  const last = useRef<number>(0);

  const smallAngle = 2 * Math.PI * Math.sqrt(length / G);
  // Büyük açı düzeltmesi (ilk iki terim) — tam eliptik integral yerine
  // öğrenci seviyesinde yeterli ve sapmanın yönünü doğru gösteriyor.
  const a = (angle * Math.PI) / 180;
  const realPeriod =
    smallAngle * (1 + (1 / 16) * a * a + (11 / 3072) * a * a * a * a);
  const deviation = ((realPeriod - smallAngle) / smallAngle) * 100;

  useEffect(() => {
    if (!running) {
      if (raf.current) cancelAnimationFrame(raf.current);
      raf.current = null;
      return;
    }
    last.current = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last.current) / 1000, 0.05);
      last.current = now;
      setT((prev) => prev + dt);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [running]);

  const theta = a * Math.cos((2 * Math.PI * t) / realPeriod);

  const W = 420;
  const H = 260;
  const pivotX = W / 2;
  const pivotY = 30;
  // Uzunluğu ekrana ölçekle; en uzun sarkaç çerçeveye sığsın.
  const pxLen = r2(60 + (length / 4) * 150);
  const bobX = r2(pivotX + pxLen * Math.sin(theta));
  const bobY = r2(pivotY + pxLen * Math.cos(theta));
  const bobR = 8 + mass * 3;

  return (
    <SimShell
      id="sarkac"
      title="Sarkaç"
      subject="Fizik"
      summary="Periyodu ne belirler? Kütleyi oynat ve şaşır."
      help={{
        intro:
          "Bir sarkacın bir tam salınım süresine periyot denir. Sezgi ağır sarkacın yavaş salınacağını söyler; ölçüm söylemiyor.",
        steps: [
          "Kütleyi sonuna kadar oynat — periyodun değişmediğini gör.",
          "İpi uzat: periyot uzunluğun kareköküyle artıyor, doğru orantılı değil.",
          "Açıyı 40°'nin üstüne çıkar — küçük açı formülü sapmaya başlıyor.",
        ],
        legend: [
          { color: "#f4ae0b", label: "Sarkaç" },
          { color: "#7aa2f7", label: "Denge konumu" },
        ],
      }}
      controls={
        <>
          <SimSlider
            label="İp uzunluğu"
            value={length}
            onChange={setLength}
            min={0.2}
            max={4}
            step={0.1}
            unit=" m"
            format={(v) => v.toFixed(1)}
          />
          <SimSlider
            label="Başlangıç açısı"
            value={angle}
            onChange={setAngle}
            min={5}
            max={80}
            unit="°"
          />
          <SimSlider
            label="Kütle"
            value={mass}
            onChange={setMass}
            min={0.5}
            max={5}
            step={0.5}
            unit=" kg"
            format={(v) => v.toFixed(1)}
          />
          <button
            type="button"
            className="sim-chip is-on"
            onClick={() => setRunning((r) => !r)}
          >
            {running ? "Durdur" : "Devam et"}
          </button>
        </>
      }
      readouts={
        <>
          <SimReadout
            label="Periyot"
            tone="highlight"
            rows={[
              { label: "Gerçek", value: `${realPeriod.toFixed(3)} s` },
              { label: "Küçük açı formülü", value: `${smallAngle.toFixed(3)} s` },
            ]}
          />
          <SimReadout
            label="Formülün sapması"
            tone={deviation > 1 ? "accent" : "neutral"}
            rows={[
              { label: "Fark", value: `%${deviation.toFixed(2)}` },
              {
                label: "Durum",
                value: deviation < 1 ? "Formül güvenli" : "Açı fazla büyük",
              },
            ]}
          />
          <SimReadout
            label="Kütlenin etkisi"
            rows={[
              { label: "Kütle", value: `${mass.toFixed(1)} kg` },
              { label: "Periyoda etkisi", value: "yok" },
            ]}
          />
        </>
      }
    >
      <PredictGate
        question={`İp ${length.toFixed(1)} m, açı ${angle}°. Bir tam salınım kaç saniye sürer?`}
        hint="Kütlenin bir rolü var mı, ona da karar ver."
        actual={realPeriod}
        unit=" s"
        format={(v) => v.toFixed(2)}
      />

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="sim-chart"
        role="img"
        aria-label={`Periyot ${realPeriod.toFixed(2)} saniye`}
      >
        {/* Denge konumu */}
        <line
          x1={pivotX}
          x2={pivotX}
          y1={pivotY}
          y2={pivotY + pxLen + 20}
          stroke="#7aa2f7"
          strokeWidth="1"
          strokeDasharray="4 4"
          opacity="0.45"
        />
        {/* Tavan */}
        <line
          x1={pivotX - 40}
          x2={pivotX + 40}
          y1={pivotY}
          y2={pivotY}
          stroke="#3a3a3a"
          strokeWidth="3"
        />
        <line
          x1={pivotX}
          y1={pivotY}
          x2={bobX}
          y2={bobY}
          stroke="#8a8a8a"
          strokeWidth="1.5"
        />
        <circle cx={bobX} cy={bobY} r={bobR} fill="#f4ae0b" />
        <text x={12} y={H - 12} className="sim-axis">
          Kütle büyüdükçe top büyür, periyot değişmez.
        </text>
      </svg>
    </SimShell>
  );
}
