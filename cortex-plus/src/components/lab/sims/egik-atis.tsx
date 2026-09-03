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
 * Eğik atış.
 *
 * Öğretmek istediği tek şey: menzil açıya simetrik bağlı ve 45°'de en büyük.
 * Bunu formülle söylemek işe yaramıyor; öğrencinin 30° ile 60°'yi deneyip
 * aynı menzili görmesi gerekiyor. O yüzden ekranda "en iyi açı" göstergesi
 * ve seçilen açının yanında simetriği duruyor.
 *
 * Hava direnci yok — orta öğretim modeli bu. Yardımda açıkça yazıyor ki
 * öğrenci gerçek dünyayla karıştırmasın.
 */

const G = 9.81;

export function EgikAtisLab() {
  const [speed, setSpeed] = useState(20);
  const [angle, setAngle] = useState(45);
  const [height, setHeight] = useState(0);

  const rad = (angle * Math.PI) / 180;
  const vx = speed * Math.cos(rad);
  const vy = speed * Math.sin(rad);

  // Yerden yüksekten atışta uçuş süresi ikinci derece denklemin pozitif kökü.
  const flight = (vy + Math.sqrt(vy * vy + 2 * G * height)) / G;
  const range = vx * flight;
  const apex = height + (vy * vy) / (2 * G);

  const path = useMemo(() => {
    const steps = 60;
    return Array.from({ length: steps + 1 }, (_, i) => {
      const t = (i / steps) * flight;
      return { x: vx * t, y: height + vy * t - 0.5 * G * t * t };
    });
  }, [vx, vy, height, flight]);

  const W = 560;
  const H = 260;
  const PAD = 28;
  const maxX = Math.max(range, 1);
  const maxY = Math.max(apex, 1) * 1.15;

  const px = (x: number) => r2(PAD + (x / maxX) * (W - PAD * 2));
  const py = (y: number) => r2(H - PAD - (y / maxY) * (H - PAD * 2));

  const d = path.map((p, i) => `${i ? "L" : "M"}${px(p.x)},${py(p.y)}`).join(" ");

  // Aynı menzili veren diğer açı — simetriyi görünür kılıyor.
  const mirror = 90 - angle;

  return (
    <SimShell
      id="egik-atis"
      title="Eğik atış"
      subject="Fizik"
      summary="Hangi açı en uzağa atar? Dene, simetriyi kendin gör."
      help={{
        intro:
          "Bir cismi belli bir hızla eğik fırlattığında yatay hız sabit kalır, düşey hız yerçekimiyle azalır. Menzil bu ikisinin çarpışmasından çıkar.",
        steps: [
          "Hızı ve açıyı değiştir, yörüngenin nasıl değiştiğini izle.",
          "30° ile 60°'yi dene — menzilin aynı çıktığını göreceksin.",
          "Başlangıç yüksekliğini artırınca en iyi açının 45°'nin altına indiğine dikkat et.",
        ],
        legend: [
          { color: "#f4ae0b", label: "Yörünge" },
          { color: "#7aa2f7", label: "Tepe noktası" },
        ],
      }}
      controls={
        <>
          <SimSlider
            label="Çıkış hızı"
            value={speed}
            onChange={setSpeed}
            min={5}
            max={60}
            unit=" m/s"
          />
          <SimSlider
            label="Açı"
            value={angle}
            onChange={setAngle}
            min={5}
            max={85}
            unit="°"
          />
          <SimSlider
            label="Başlangıç yüksekliği"
            value={height}
            onChange={setHeight}
            min={0}
            max={50}
            unit=" m"
          />
        </>
      }
      readouts={
        <>
          <SimReadout
            label="Menzil"
            tone="highlight"
            rows={[
              { label: "Yatay", value: `${range.toFixed(1)} m` },
              { label: "Uçuş", value: `${flight.toFixed(2)} s` },
            ]}
          />
          <SimReadout
            label="Tepe noktası"
            tone="accent"
            rows={[
              { label: "Yükseklik", value: `${apex.toFixed(1)} m` },
              { label: "Zaman", value: `${(vy / G).toFixed(2)} s` },
            ]}
          />
          <SimReadout
            label="Hız bileşenleri"
            rows={[
              { label: "Yatay", value: `${vx.toFixed(1)} m/s` },
              { label: "Düşey", value: `${vy.toFixed(1)} m/s` },
            ]}
          />
          <SimReadout
            label="Simetri"
            rows={[
              { label: "Aynı menzil", value: height === 0 ? `${mirror}°` : "—" },
              {
                label: "En iyi açı",
                value: height === 0 ? "45°" : `${bestAngle(speed, height)}°`,
              },
            ]}
          />
        </>
      }
    >
      <PredictGate
        question={`${speed} m/s hızla ${angle}° açıyla atarsan cisim kaç metre uzağa düşer?`}
        hint="Yerçekimi 9,81 m/s². Hava direnci yok."
        actual={range}
        unit=" m"
        format={(v) => v.toFixed(1)}
      />

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="sim-chart"
        role="img"
        aria-label={`Menzil ${range.toFixed(1)} metre, tepe ${apex.toFixed(1)} metre`}
      >
        {/* Zemin */}
        <line
          x1={PAD}
          x2={W - PAD}
          y1={py(0)}
          y2={py(0)}
          stroke="#3a3a3a"
          strokeWidth="1.5"
        />
        <path d={d} fill="none" stroke="#f4ae0b" strokeWidth="2.5" />

        {/* Tepe noktası */}
        <circle cx={px(vx * (vy / G))} cy={py(apex)} r="4" fill="#7aa2f7" />
        <line
          x1={px(vx * (vy / G))}
          x2={px(vx * (vy / G))}
          y1={py(apex)}
          y2={py(0)}
          stroke="#7aa2f7"
          strokeWidth="1"
          strokeDasharray="3 3"
          opacity="0.5"
        />

        {/* Düşüş noktası */}
        <circle cx={px(range)} cy={py(0)} r="4" fill="#f4ae0b" />

        <text x={PAD} y={H - 8} className="sim-axis">
          0 m
        </text>
        <text x={W - PAD} y={H - 8} textAnchor="end" className="sim-axis">
          {range.toFixed(0)} m
        </text>
      </svg>
    </SimShell>
  );
}

/**
 * Yerden yüksekten atışta en iyi açı 45°'nin altındadır; kapalı çözüm yerine
 * tarama yapıyoruz — bir derecelik çözünürlük öğrenci için fazlasıyla yeterli
 * ve formülü ezberletmek amacımız değil.
 */
function bestAngle(speed: number, height: number): number {
  let best = 45;
  let bestRange = -1;
  for (let a = 1; a <= 89; a++) {
    const r = (a * Math.PI) / 180;
    const vx = speed * Math.cos(r);
    const vy = speed * Math.sin(r);
    const t = (vy + Math.sqrt(vy * vy + 2 * G * height)) / G;
    const range = vx * t;
    if (range > bestRange) {
      bestRange = range;
      best = a;
    }
  }
  return best;
}
