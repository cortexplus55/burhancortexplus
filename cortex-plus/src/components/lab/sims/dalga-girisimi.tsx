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
 * Dalga girişimi.
 *
 * İki dalganın toplamı sezgiye aykırı: aynı genlikte iki dalga yan yana
 * gelince sonuç sıfır da olabilir, iki katı da. Belirleyen tek şey faz farkı.
 *
 * Üç eğri birlikte çiziliyor (iki kaynak + toplam) çünkü toplamı tek başına
 * göstermek "neden böyle oldu" sorusunu cevapsız bırakıyor.
 */

export function DalgaGirisimiLab() {
  const [amp1, setAmp1] = useState(1);
  const [amp2, setAmp2] = useState(1);
  const [phase, setPhase] = useState(0);
  const [freqRatio, setFreqRatio] = useState("1");

  const ratio = Number(freqRatio);
  const phaseRad = (phase * Math.PI) / 180;

  const W = 560;
  const H = 240;
  const PAD = 24;
  const cycles = 2;

  const points = useMemo(() => {
    const n = 240;
    return Array.from({ length: n + 1 }, (_, i) => {
      const x = (i / n) * cycles * 2 * Math.PI;
      const y1 = amp1 * Math.sin(x);
      const y2 = amp2 * Math.sin(ratio * x + phaseRad);
      return { x, y1, y2, sum: y1 + y2 };
    });
  }, [amp1, amp2, ratio, phaseRad]);

  const maxAmp = Math.max(amp1 + amp2, 0.5);
  const px = (x: number) => r2(PAD + (x / (cycles * 2 * Math.PI)) * (W - PAD * 2));
  const py = (y: number) => r2(H / 2 - (y / maxAmp) * (H / 2 - PAD));

  const line = (key: "y1" | "y2" | "sum") =>
    points.map((p, i) => `${i ? "L" : "M"}${px(p.x)},${py(p[key])}`).join(" ");

  // Toplam dalganın tepe genliği — aynı frekansta kapalı formülle,
  // farklı frekansta örneklerden ölçülerek.
  const peak =
    ratio === 1
      ? Math.sqrt(
          amp1 * amp1 + amp2 * amp2 + 2 * amp1 * amp2 * Math.cos(phaseRad),
        )
      : Math.max(...points.map((p) => Math.abs(p.sum)));

  const kind =
    ratio !== 1
      ? "Farklı frekans — vuru"
      : Math.abs(phase % 360) < 15 || Math.abs((phase % 360) - 360) < 15
        ? "Yapıcı girişim"
        : Math.abs((phase % 360) - 180) < 15
          ? "Yıkıcı girişim"
          : "Kısmi girişim";

  return (
    <SimShell
      id="dalga-girisimi"
      title="Dalga girişimi"
      subject="Fizik"
      summary="İki dalga üst üste binince ne olur? Faz farkı her şeyi değiştirir."
      help={{
        intro:
          "Aynı ortamdaki iki dalga karşılaşınca genlikleri noktası noktasına toplanır. Sonuç, aralarındaki faz farkına göre büyür ya da yok olur.",
        steps: [
          "Faz farkını 0°'de bırak: tepeler üst üste gelir, genlik toplanır.",
          "180°'ye getir: tepe ile çukur çakışır, eşit genlikte dalgalar birbirini yok eder.",
          "Frekans oranını değiştir — düzenli desen bozulur, vuru ortaya çıkar.",
        ],
        legend: [
          { color: "#7aa2f7", label: "1. dalga" },
          { color: "#54c594", label: "2. dalga" },
          { color: "#f4ae0b", label: "Toplam" },
        ],
      }}
      controls={
        <>
          <SimSlider
            label="1. dalga genliği"
            value={amp1}
            onChange={setAmp1}
            min={0}
            max={2}
            step={0.1}
            format={(v) => v.toFixed(1)}
          />
          <SimSlider
            label="2. dalga genliği"
            value={amp2}
            onChange={setAmp2}
            min={0}
            max={2}
            step={0.1}
            format={(v) => v.toFixed(1)}
          />
          <SimSlider
            label="Faz farkı"
            value={phase}
            onChange={setPhase}
            min={0}
            max={360}
            step={5}
            unit="°"
          />
          <SimChips
            label="Frekans oranı"
            value={freqRatio}
            options={[
              { id: "1", label: "1:1" },
              { id: "2", label: "2:1" },
              { id: "3", label: "3:1" },
              { id: "1.5", label: "3:2" },
            ]}
            onChange={setFreqRatio}
          />
        </>
      }
      readouts={
        <>
          <SimReadout
            label="Sonuç"
            tone="highlight"
            rows={[
              { label: "Tepe genlik", value: peak.toFixed(2) },
              { label: "Tür", value: kind },
            ]}
          />
          <SimReadout
            label="Kaynaklar"
            tone="accent"
            rows={[
              { label: "Genlik toplamı", value: (amp1 + amp2).toFixed(2) },
              { label: "Genlik farkı", value: Math.abs(amp1 - amp2).toFixed(2) },
            ]}
          />
          <SimReadout
            label="Faz"
            rows={[
              { label: "Fark", value: `${phase}°` },
              { label: "Radyan", value: phaseRad.toFixed(2) },
            ]}
          />
        </>
      }
    >
      <PredictGate
        question={`Genlikleri ${amp1.toFixed(1)} ve ${amp2.toFixed(1)} olan iki dalga ${phase}° faz farkıyla toplanırsa tepe genlik ne olur?`}
        hint="0° tam üst üste, 180° tam ters."
        actual={peak}
        format={(v) => v.toFixed(2)}
      />

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="sim-chart"
        role="img"
        aria-label={`${kind}, tepe genlik ${peak.toFixed(2)}`}
      >
        <line
          x1={PAD}
          x2={W - PAD}
          y1={H / 2}
          y2={H / 2}
          stroke="#2e2e2e"
          strokeWidth="1"
        />
        <path d={line("y1")} fill="none" stroke="#7aa2f7" strokeWidth="1.5" opacity="0.75" />
        <path d={line("y2")} fill="none" stroke="#54c594" strokeWidth="1.5" opacity="0.75" />
        <path d={line("sum")} fill="none" stroke="#f4ae0b" strokeWidth="2.5" />
      </svg>
    </SimShell>
  );
}
