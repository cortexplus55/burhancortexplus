"use client";

import { useState } from "react";
import { PredictGate } from "@/components/lab/predict-gate";
import {
  SimChips,
  SimReadout,
  SimShell,
  SimSlider,
  r2,
} from "@/components/lab/sim-shell";

/**
 * İnce kenarlı / kalın kenarlı mercek.
 *
 * Görüntünün ne zaman gerçek ne zaman sanal olduğu formülle ezberleniyor.
 * Burada cisim odak noktasının içine sokulduğunda ışınlar ıraksıyor ve
 * görüntü aynı tarafa, düz olarak geçiyor — kural değil, olay görünüyor.
 *
 * Üç temel ışın çiziliyor (eksene paralel, merkezden, odaktan) çünkü
 * görüntünün nerede oluştuğu bu ışınların kesişimi; tek ışınla anlaşılmıyor.
 */

type LensType = "ince" | "kalin";

export function MercekLab() {
  const [type, setType] = useState<LensType>("ince");
  const [focal, setFocal] = useState(60);
  const [distance, setDistance] = useState(150);
  const [height, setHeight] = useState(50);

  // Kalın kenarlı (ıraksak) merceğin odak uzaklığı negatif.
  const f = type === "ince" ? focal : -focal;
  const dO = distance;

  // 1/f = 1/dO + 1/dI
  const dI = (f * dO) / (dO - f);
  const mag = -dI / dO;
  const hI = height * mag;

  const real = type === "ince" && dO > focal;
  const upright = mag > 0;

  const W = 580;
  const H = 280;
  const CX = W / 2;
  const CY = H / 2;
  const S = 0.55; // mm→px ölçeği

  const sx = (x: number) => r2(CX + x * S);
  const sy = (y: number) => r2(CY - y * S);

  const objTop = { x: -dO, y: height };
  const imgTop = { x: dI, y: hI };

  return (
    <SimShell
      id="mercek"
      title="Mercekte görüntü"
      subject="Fizik"
      summary="Görüntü ne zaman gerçek, ne zaman sanal olur?"
      help={{
        intro:
          "İnce kenarlı mercek ışınları odakta toplar, kalın kenarlı mercek ıraksatır. Görüntünün yeri ve büyüklüğü 1/f = 1/dO + 1/dI bağıntısından çıkar; ama asıl anlaşılması gereken ışınların nerede kesiştiği.",
        steps: [
          "Cismi odak noktasının içine sok — ışınlar kesişmez, görüntü sanal ve düz olur.",
          "Cismi 2f'ye getir: görüntü aynı boyda, ters ve diğer tarafta.",
          "Kalın kenarlı mercekte cisim nerede olursa olsun görüntü hep sanal, düz ve küçüktür.",
        ],
        legend: [
          { color: "#f4ae0b", label: "Cisim" },
          { color: "#54c594", label: "Görüntü" },
          { color: "#7aa2f7", label: "Işınlar" },
        ],
      }}
      controls={
        <>
          <SimChips
            label="Mercek"
            value={type}
            options={[
              { id: "ince" as LensType, label: "İnce kenarlı" },
              { id: "kalin" as LensType, label: "Kalın kenarlı" },
            ]}
            onChange={setType}
          />
          <SimSlider label="Odak uzaklığı f" value={focal} onChange={setFocal} min={20} max={120} step={5} unit=" mm" />
          <SimSlider label="Cisim uzaklığı" value={distance} onChange={setDistance} min={20} max={260} step={5} unit=" mm" />
          <SimSlider label="Cisim boyu" value={height} onChange={setHeight} min={15} max={80} step={5} unit=" mm" />
        </>
      }
      readouts={
        <>
          <SimReadout
            label="Görüntü"
            tone="highlight"
            rows={[
              { label: "Tür", value: real ? "Gerçek" : "Sanal" },
              { label: "Yön", value: upright ? "Düz" : "Ters" },
            ]}
          />
          <SimReadout
            label="Konum"
            tone="accent"
            rows={[
              { label: "dI", value: `${dI.toFixed(1)} mm` },
              { label: "Taraf", value: dI > 0 ? "karşı" : "aynı" },
            ]}
          />
          <SimReadout
            label="Büyüklük"
            rows={[
              { label: "Büyütme", value: `${mag.toFixed(2)}×` },
              { label: "Boy", value: `${Math.abs(hI).toFixed(1)} mm` },
            ]}
          />
          <SimReadout
            label="Odak"
            rows={[
              { label: "f", value: `${f} mm` },
              { label: "Cisim konumu", value: konum(dO, focal, type) },
            ]}
          />
        </>
      }
    >
      <PredictGate
        question={`Cisim ${dO} mm uzaklıkta, odak ${focal} mm. Görüntü gerçek mi sanal mı olur ve kaç kat büyür?`}
        hint="Büyütme negatifse görüntü ters demektir."
        actual={mag}
        unit="×"
        format={(v) => v.toFixed(2)}
        tolerance={0.2}
      />

      <svg viewBox={`0 0 ${W} ${H}`} className="sim-chart" role="img" aria-label={`${real ? "Gerçek" : "Sanal"} görüntü, büyütme ${mag.toFixed(2)}`}>
        {/* Optik eksen */}
        <line x1={10} x2={W - 10} y1={CY} y2={CY} stroke="#4a4a4a" strokeWidth="1" />

        {/* Mercek */}
        <ellipse
          cx={CX}
          cy={CY}
          rx={type === "ince" ? 11 : 6}
          ry={78}
          fill="rgba(122,162,247,0.14)"
          stroke="#7aa2f7"
          strokeWidth="1.5"
        />

        {/* Odak noktaları */}
        {[-focal, focal].map((p) => (
          <g key={p}>
            <circle cx={sx(p)} cy={CY} r="3" fill="#8a8a8a" />
            <text x={sx(p)} y={CY + 18} textAnchor="middle" className="sim-axis">F</text>
          </g>
        ))}
        {[-2 * focal, 2 * focal].map((p) => (
          <circle key={p} cx={sx(p)} cy={CY} r="2" fill="#5a5a5a" />
        ))}

        {/* Cisim */}
        <line x1={sx(-dO)} y1={CY} x2={sx(-dO)} y2={sy(height)} stroke="#f4ae0b" strokeWidth="3" />
        <polygon
          points={`${sx(-dO)},${sy(height)} ${sx(-dO) - 5},${sy(height) + 9} ${sx(-dO) + 5},${sy(height) + 9}`}
          fill="#f4ae0b"
        />

        {/* Işın 1: eksene paralel gelir, odaktan geçer */}
        <line x1={sx(-dO)} y1={sy(height)} x2={CX} y2={sy(height)} stroke="#7aa2f7" strokeWidth="1.2" />
        <line
          x1={CX}
          y1={sy(height)}
          x2={sx(dI > 0 ? dI : 2 * focal)}
          y2={sy(dI > 0 ? hI : height * (1 - (2 * focal) / f))}
          stroke="#7aa2f7"
          strokeWidth="1.2"
        />

        {/* Işın 2: merkezden geçer, kırılmaz */}
        <line
          x1={sx(-dO)}
          y1={sy(height)}
          x2={sx(dI > 0 ? dI : 2 * focal)}
          y2={sy(dI > 0 ? hI : (-height * (2 * focal)) / dO)}
          stroke="#7aa2f7"
          strokeWidth="1.2"
        />

        {/* Sanal görüntüde ışınların geriye uzantısı kesikli. */}
        {dI < 0 ? (
          <>
            <line x1={CX} y1={sy(height)} x2={sx(dI)} y2={sy(hI)} stroke="#7aa2f7" strokeWidth="1" strokeDasharray="4 4" opacity="0.6" />
            <line x1={sx(-dO)} y1={sy(height)} x2={sx(dI)} y2={sy(hI)} stroke="#7aa2f7" strokeWidth="1" strokeDasharray="4 4" opacity="0.6" />
          </>
        ) : null}

        {/* Görüntü */}
        <line x1={sx(dI)} y1={CY} x2={sx(dI)} y2={sy(hI)} stroke="#54c594" strokeWidth="3" strokeDasharray={real ? undefined : "5 3"} />
        <polygon
          points={`${sx(dI)},${sy(hI)} ${sx(dI) - 5},${sy(hI) + (hI > 0 ? 9 : -9)} ${sx(dI) + 5},${sy(hI) + (hI > 0 ? 9 : -9)}`}
          fill="#54c594"
        />

        <text x={12} y={20} className="sim-axis">
          {real ? "Gerçek görüntü — perdeye düşer" : "Sanal görüntü — perdeye düşmez"}
        </text>
      </svg>
    </SimShell>
  );
}

function konum(dO: number, f: number, type: LensType): string {
  if (type === "kalin") return "fark etmez";
  if (dO < f) return "F içinde";
  if (Math.abs(dO - f) < 1) return "F üzerinde";
  if (dO < 2 * f) return "F ile 2F arası";
  if (Math.abs(dO - 2 * f) < 1) return "2F üzerinde";
  return "2F dışında";
}
