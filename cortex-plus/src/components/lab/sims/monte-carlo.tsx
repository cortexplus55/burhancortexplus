"use client";

import { useMemo, useState } from "react";
import { PredictGate } from "@/components/lab/predict-gate";
import { SimReadout, SimShell, SimSlider, r2 } from "@/components/lab/sim-shell";
import { seededRandom } from "@/lib/parity/daily-puzzles";

/**
 * Monte Carlo ile π.
 *
 * Rastgelelikle kesin bir sayı bulunabilmesi öğrenciye tuhaf geliyor.
 * Kareye rastgele nokta atıp çeyrek dairenin içine düşenlerin oranına
 * bakmak, olasılığın alan ölçtüğünü gösteriyor.
 *
 * Nokta üretimi TOHUMLU: aynı nokta sayısında herkes aynı sonucu alıyor ve
 * "benimki neden farklı çıktı" sorusu ortadan kalkıyor. Yakınsamanın yavaş
 * olduğu (hata ~1/√n) da hata kartında açıkça duruyor — Monte Carlo'nun
 * gerçek karakteri bu.
 */

const W = 320;

export function MonteCarloLab() {
  const [count, setCount] = useState(500);
  const [seed, setSeed] = useState(1);

  const points = useMemo(() => {
    const rand = seededRandom(seed * 7919 + 13);
    const pts: { x: number; y: number; inside: boolean }[] = [];
    for (let i = 0; i < count; i++) {
      const x = rand();
      const y = rand();
      pts.push({ x, y, inside: x * x + y * y <= 1 });
    }
    return pts;
  }, [count, seed]);

  const inside = points.filter((p) => p.inside).length;
  const estimate = (4 * inside) / Math.max(count, 1);
  const error = Math.abs(estimate - Math.PI);
  // Monte Carlo hatası örneklem sayısının kareköküyle azalıyor.
  const expectedError = 1.64 / Math.sqrt(count);

  return (
    <SimShell
      id="monte-carlo"
      title="Monte Carlo ile π"
      subject="Matematik"
      summary="Rastgele nokta atarak π nasıl bulunur?"
      help={{
        intro:
          "Birim kareye rastgele nokta atarsak, çeyrek dairenin içine düşen noktaların oranı alanların oranına eşit olur. Çeyrek dairenin alanı π/4 olduğu için, oranı dörtle çarpınca π çıkar.",
        steps: [
          "Nokta sayısını artır — tahmin π'ye yaklaşır ama düzenli değil, zıplayarak.",
          "Tohumu değiştir: aynı sayıda noktayla farklı bir sonuç çıkar. Rastgelelik bu.",
          "Hata kartına bak — nokta sayısını dört katına çıkarmak hatayı sadece yarıya indiriyor.",
        ],
        legend: [
          { color: "#f4ae0b", label: "Daire içinde" },
          { color: "#4a4a4a", label: "Dışında" },
        ],
      }}
      controls={
        <>
          <SimSlider
            label="Nokta sayısı"
            value={count}
            onChange={setCount}
            min={50}
            max={20000}
            step={50}
            format={(v) => v.toLocaleString("tr-TR")}
          />
          <SimSlider label="Tohum" value={seed} onChange={setSeed} min={1} max={50} />
        </>
      }
      readouts={
        <>
          <SimReadout
            label="π tahmini"
            tone="highlight"
            rows={[
              { label: "4 × (içeride/toplam)", value: estimate.toFixed(5) },
              { label: "Gerçek π", value: Math.PI.toFixed(5) },
            ]}
          />
          <SimReadout
            label="Sayım"
            tone="accent"
            rows={[
              { label: "İçeride", value: inside.toLocaleString("tr-TR") },
              { label: "Toplam", value: count.toLocaleString("tr-TR") },
            ]}
          />
          <SimReadout
            label="Hata"
            rows={[
              { label: "Gerçek sapma", value: error.toFixed(5) },
              { label: "Beklenen (~1/√n)", value: expectedError.toFixed(5) },
            ]}
          />
        </>
      }
    >
      <PredictGate
        question={`${count.toLocaleString("tr-TR")} rastgele noktayla π tahmini ne kadar sapar?`}
        hint="Hata nokta sayısının kareköküyle azalır, sayısıyla değil."
        actual={error}
        format={(v) => v.toFixed(4)}
        tolerance={0.6}
      />

      <svg
        viewBox={`0 0 ${W} ${W}`}
        className="sim-chart"
        style={{ maxWidth: "22rem", margin: "0 auto" }}
        role="img"
        aria-label={`π tahmini ${estimate.toFixed(4)}`}
      >
        <rect x={0} y={0} width={W} height={W} fill="#141414" stroke="#3a3a3a" strokeWidth="1" />
        <path
          d={`M0,${W} A${W},${W} 0 0 1 ${W},0`}
          fill="rgba(244,174,11,0.06)"
          stroke="#f4ae0b"
          strokeWidth="1.5"
        />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={r2(p.x * W)}
            cy={r2(W - p.y * W)}
            r={count > 5000 ? 0.8 : count > 1500 ? 1.2 : 1.8}
            fill={p.inside ? "#f4ae0b" : "#4a4a4a"}
            opacity={p.inside ? 0.85 : 0.6}
          />
        ))}
      </svg>
    </SimShell>
  );
}
