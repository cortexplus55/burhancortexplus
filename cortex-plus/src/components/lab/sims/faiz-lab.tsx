"use client";

import { useMemo, useState } from "react";
import { PredictGate } from "@/components/lab/predict-gate";
import {
  SimChips,
  SimReadout,
  SimShell,
  SimSlider,
} from "@/components/lab/sim-shell";

/**
 * Faiz laboratuvarı.
 *
 * Öğretmek istediği tek şey var: basit faiz doğrusal, bileşik faiz üstel.
 * Kısa vadede ikisi neredeyse aynı, uzun vadede arayı bileşik açıyor. Bu
 * fark sayıyla anlatılınca akılda kalmıyor, iki eğri yan yana çizilince
 * kalıyor — o yüzden merkezde grafik var, tablo değil.
 */

type Period = { id: string; label: string; perYear: number };

const PERIODS: Period[] = [
  { id: "yillik", label: "Yıllık", perYear: 1 },
  { id: "altiaylik", label: "6 aylık", perYear: 2 },
  { id: "ucaylik", label: "3 aylık", perYear: 4 },
  { id: "aylik", label: "Aylık", perYear: 12 },
  { id: "gunluk", label: "Günlük", perYear: 365 },
];

// Para birimini Intl'in "currency" biçimine bırakmıyoruz: tam ICU verisi
// olmayan ortamlarda TRY yerine dolar işareti düşüyor (önizlemede görüldü).
// Sayıyı yerelleştirip simgeyi kendimiz koyuyoruz.
const TRY = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
const money = (v: number) => `${TRY.format(v)} ₺`;

function simple(principal: number, rate: number, years: number) {
  return principal * (1 + (rate / 100) * years);
}

function compound(
  principal: number,
  rate: number,
  years: number,
  perYear: number,
) {
  return principal * Math.pow(1 + rate / 100 / perYear, perYear * years);
}

export function FaizLab() {
  const [principal, setPrincipal] = useState(10_000);
  const [rate, setRate] = useState(30);
  const [years, setYears] = useState(10);
  const [periodId, setPeriodId] = useState("yillik");

  const perYear = PERIODS.find((p) => p.id === periodId)?.perYear ?? 1;

  const simpleTotal = simple(principal, rate, years);
  const compoundTotal = compound(principal, rate, years, perYear);
  const gap = compoundTotal - simpleTotal;

  // Eğri noktaları: yıl başına bir örnek yeterli, aradaki kıvrımı çizgi
  // zaten taşıyor.
  const curve = useMemo(() => {
    const steps = Math.max(2, Math.min(years, 40));
    return Array.from({ length: steps + 1 }, (_, i) => {
      const t = (i / steps) * years;
      return {
        t,
        s: simple(principal, rate, t),
        c: compound(principal, rate, t, perYear),
      };
    });
  }, [principal, rate, years, perYear]);

  const maxY = Math.max(...curve.map((p) => p.c), 1);
  const W = 560;
  const H = 260;
  const PAD = 34;

  const x = (t: number) => PAD + (t / Math.max(years, 1e-9)) * (W - PAD * 2);
  const y = (v: number) => H - PAD - (v / maxY) * (H - PAD * 2);

  const path = (key: "s" | "c") =>
    curve.map((p, i) => `${i ? "L" : "M"}${x(p.t)},${y(p[key])}`).join(" ");

  return (
    <SimShell
      id="faiz"
      title="Faiz laboratuvarı"
      subject="Matematik"
      summary="Aynı para, aynı oran, aynı süre — iki farklı sonuç."
      help={{
        intro:
          "Basit faiz her yıl aynı miktarı ekler; bileşik faiz kazandığın faize de faiz işletir. Kısa vadede fark küçük görünür, uzadıkça açılır.",
        steps: [
          "Anapara, oran ve süreyi kaydırıcılarla değiştir.",
          "Bileşik faizin yılda kaç kez işlediğini seç — sıklık arttıkça sonuç büyür.",
          "İki eğri arasındaki taralı alan, bileşik faizin fazladan kazandırdığı tutardır.",
        ],
        legend: [
          { color: "#7aa2f7", label: "Basit faiz" },
          { color: "#f4ae0b", label: "Bileşik faiz" },
        ],
      }}
      controls={
        <>
          <SimSlider
            label="Anapara"
            value={principal}
            onChange={setPrincipal}
            min={1000}
            max={200_000}
            step={1000}
            format={money}
          />
          <SimSlider
            label="Yıllık oran"
            value={rate}
            onChange={setRate}
            min={1}
            max={80}
            unit="%"
          />
          <SimSlider
            label="Süre"
            value={years}
            onChange={setYears}
            min={1}
            max={40}
            unit=" yıl"
          />
          <SimChips
            label="Faiz işleme sıklığı"
            value={periodId}
            options={PERIODS.map((p) => ({ id: p.id, label: p.label }))}
            onChange={setPeriodId}
          />
        </>
      }
      readouts={
        <>
          <SimReadout
            label="Basit faiz"
            tone="neutral"
            rows={[
              { label: "Toplam", value: money(simpleTotal) },
              { label: "Kazanç", value: money(simpleTotal - principal) },
            ]}
          />
          <SimReadout
            label="Bileşik faiz"
            tone="accent"
            rows={[
              { label: "Toplam", value: money(compoundTotal) },
              { label: "Kazanç", value: money(compoundTotal - principal) },
            ]}
          />
          <SimReadout
            label="Aradaki fark"
            tone="highlight"
            rows={[
              { label: "Tutar", value: money(gap) },
              {
                label: "Anaparaya oranı",
                value: `%${((gap / principal) * 100).toFixed(1)}`,
              },
            ]}
          />
        </>
      }
    >
      <PredictGate
        question={`${money(principal)} parayı yıllık %${rate} ile ${years} yıl tutarsan, bileşik faiz basit faizden ne kadar fazla kazandırır?`}
        hint="Tam tutturmak gerekmiyor — büyüklük sırasını yakalamaya çalış."
        actual={gap}
        format={money}
      />

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="sim-chart"
        role="img"
        aria-label={`Basit faiz ${money(simpleTotal)}, bileşik faiz ${money(compoundTotal)}`}
      >
        <defs>
          <linearGradient id="faiz-gap" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f4ae0b" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#f4ae0b" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Yatay ızgara — göz değeri okuyabilsin. */}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <line
            key={f}
            x1={PAD}
            x2={W - PAD}
            y1={y(maxY * f)}
            y2={y(maxY * f)}
            stroke="#2e2e2e"
            strokeWidth="1"
          />
        ))}

        {/* İki eğri arasındaki alan = bileşik faizin fazlası. */}
        <path
          d={`${path("c")} L${x(years)},${y(simple(principal, rate, years))} ${curve
            .slice()
            .reverse()
            .map((p) => `L${x(p.t)},${y(p.s)}`)
            .join(" ")} Z`}
          fill="url(#faiz-gap)"
        />

        <path d={path("s")} fill="none" stroke="#7aa2f7" strokeWidth="2.5" />
        <path d={path("c")} fill="none" stroke="#f4ae0b" strokeWidth="2.5" />

        <circle cx={x(years)} cy={y(compoundTotal)} r="4" fill="#f4ae0b" />
        <circle cx={x(years)} cy={y(simpleTotal)} r="4" fill="#7aa2f7" />

        <text x={PAD} y={H - 10} className="sim-axis">
          0 yıl
        </text>
        <text x={W - PAD} y={H - 10} textAnchor="end" className="sim-axis">
          {years} yıl
        </text>
      </svg>
    </SimShell>
  );
}
