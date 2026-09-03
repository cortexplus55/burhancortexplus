"use client";

import { useMemo, useState } from "react";
import { SimChips, SimReadout, SimShell, SimSlider, r2 } from "@/components/lab/sim-shell";

/**
 * Özyinelemeli diziler.
 *
 * Öğrenci Fibonacci'yi ezberliyor ama "her terim öncekilerden üretilir"
 * fikrini genellemiyor. Burada aynı kural farklı başlangıç değerleriyle
 * çalıştırılıyor: Fibonacci, Lucas ve kendi seçtiğin başlangıç aynı
 * kuralın farklı yüzleri.
 *
 * Ardışık terimlerin oranı ayrıca gösteriliyor çünkü asıl şaşırtıcı olan
 * o: başlangıç ne olursa olsun oran altın orana yakınsıyor.
 */

type Rule = "fibonacci" | "lucas" | "ozel" | "geometrik";

const PHI = (1 + Math.sqrt(5)) / 2;

export function OzyinelemeLab() {
  const [rule, setRule] = useState<Rule>("fibonacci");
  const [a0, setA0] = useState(2);
  const [a1, setA1] = useState(5);
  const [ratio, setRatio] = useState(2);
  const [count, setCount] = useState(12);

  const terms = useMemo(() => {
    const out: number[] = [];
    if (rule === "geometrik") {
      let v = 1;
      for (let i = 0; i < count; i++) {
        out.push(v);
        v *= ratio;
      }
      return out;
    }
    const start =
      rule === "fibonacci" ? [1, 1] : rule === "lucas" ? [2, 1] : [a0, a1];
    out.push(start[0], start[1]);
    for (let i = 2; i < count; i++) out.push(out[i - 1] + out[i - 2]);
    return out.slice(0, count);
  }, [rule, a0, a1, ratio, count]);

  const ratios = terms
    .map((v, i) => (i > 0 && terms[i - 1] !== 0 ? v / terms[i - 1] : NaN))
    .filter((v) => Number.isFinite(v));
  const lastRatio = ratios[ratios.length - 1] ?? NaN;

  const W = 560;
  const H = 200;
  const PAD = 34;
  const maxV = Math.max(...terms.map(Math.abs), 1);
  const bw = (W - PAD * 2) / Math.max(terms.length, 1);

  const formula =
    rule === "geometrik"
      ? `aₙ = ${ratio} · aₙ₋₁`
      : "aₙ = aₙ₋₁ + aₙ₋₂";

  return (
    <SimShell
      id="ozyineleme"
      title="Özyinelemeli diziler"
      subject="Matematik"
      summary="Başlangıç değişse de oran neden hep altın orana gidiyor?"
      help={{
        intro:
          "Özyinelemeli dizide her terim kendinden öncekilerden üretilir. Fibonacci bunun bir örneği, tek örneği değil — aynı kural farklı başlangıçlarla farklı diziler verir.",
        steps: [
          "Kendi başlangıcını seç: dizi tamamen değişir ama oran yine altın orana yaklaşır.",
          "Terim sayısını artır — oranın yakınsaması sağdaki kartta görünür.",
          "Geometrik diziye geç: orada oran zaten sabittir, yakınsama yoktur.",
        ],
        legend: [{ color: "#f4ae0b", label: "Terimler" }],
      }}
      controls={
        <>
          <SimChips
            label="Dizi"
            value={rule}
            options={[
              { id: "fibonacci" as Rule, label: "Fibonacci" },
              { id: "lucas" as Rule, label: "Lucas" },
              { id: "ozel" as Rule, label: "Kendi başlangıcım" },
              { id: "geometrik" as Rule, label: "Geometrik" },
            ]}
            onChange={setRule}
          />
          {rule === "ozel" ? (
            <>
              <SimSlider label="a₀" value={a0} onChange={setA0} min={1} max={20} />
              <SimSlider label="a₁" value={a1} onChange={setA1} min={1} max={20} />
            </>
          ) : null}
          {rule === "geometrik" ? (
            <SimSlider label="Ortak çarpan" value={ratio} onChange={setRatio} min={2} max={5} />
          ) : null}
          <SimSlider label="Terim sayısı" value={count} onChange={setCount} min={4} max={18} />
        </>
      }
      readouts={
        <>
          <SimReadout
            label="Son terim"
            tone="highlight"
            rows={[
              { label: `a${sub(count - 1)}`, value: terms[terms.length - 1].toLocaleString("tr-TR") },
              { label: "Kural", value: formula },
            ]}
          />
          <SimReadout
            label="Ardışık oran"
            tone="accent"
            rows={[
              { label: "Son oran", value: Number.isFinite(lastRatio) ? lastRatio.toFixed(6) : "—" },
              {
                label: rule === "geometrik" ? "Ortak çarpan" : "Altın oran φ",
                value: rule === "geometrik" ? ratio.toFixed(6) : PHI.toFixed(6),
              },
            ]}
          />
          <SimReadout
            label="Yakınsama"
            rows={[
              {
                label: "Sapma",
                value:
                  rule === "geometrik"
                    ? "yok"
                    : Number.isFinite(lastRatio)
                      ? Math.abs(lastRatio - PHI).toExponential(2)
                      : "—",
              },
              { label: "Terim sayısı", value: String(count) },
            ]}
          />
        </>
      }
    >
      <div className="oz-terms">
        {terms.map((t, i) => (
          <span key={i} className="oz-term">
            <em>a{sub(i)}</em>
            {t.toLocaleString("tr-TR")}
          </span>
        ))}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="sim-chart" role="img" aria-label="Terimlerin büyümesi">
        <line x1={PAD} x2={W - PAD} y1={H - PAD} y2={H - PAD} stroke="#4a4a4a" strokeWidth="1" />
        {terms.map((t, i) => {
          const h = (Math.abs(t) / maxV) * (H - PAD * 2);
          return (
            <rect
              key={i}
              x={r2(PAD + i * bw + bw * 0.15)}
              y={r2(H - PAD - h)}
              width={r2(bw * 0.7)}
              height={r2(Math.max(h, 1))}
              fill="#f4ae0b"
              opacity={0.85}
              rx={2}
            />
          );
        })}
      </svg>
    </SimShell>
  );
}

/** 12 → "₁₂" */
function sub(n: number): string {
  const map = "₀₁₂₃₄₅₆₇₈₉";
  return String(n)
    .split("")
    .map((d) => map[Number(d)])
    .join("");
}
