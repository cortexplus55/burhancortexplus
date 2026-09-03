"use client";

import { useEffect, useRef, useState } from "react";
import { SimReadout, SimShell, SimSlider, r2 } from "@/components/lab/sim-shell";
import {
  step,
  type PendulumState,
} from "@/lib/lab/double-pendulum";

/**
 * Çift sarkaç.
 *
 * Kaosun ne demek olduğunu anlatan en temiz örnek: iki sarkaç neredeyse
 * aynı açıyla bırakılıyor, birkaç saniye birlikte gidiyorlar, sonra
 * tamamen ayrılıyorlar. "Küçük fark büyür" cümlesi ancak bu görülünce
 * anlam kazanıyor.
 *
 * İkinci sarkaç bilerek 0,001 rad farkla başlıyor. Ayrışma anını beklemek
 * simülasyonun bütün amacı; o yüzden ayrışma açısı ayrı bir kartta ve
 * izler ekranda kalıyor.
 *
 * Denklemler RK4 ile çözülüyor. Euler bu sistemde enerjiyi şişiriyor ve
 * sarkaç birkaç saniyede fırlıyor — kaosun kendisi değil, yöntemin hatası.
 */

const W = 420;
const H = 320;
const CX = W / 2;
const CY = 110;
const PX_PER_M = 70;

export function CiftSarkacLab() {
  const [angle, setAngle] = useState(120);
  const [l1, setL1] = useState(1);
  const [l2, setL2] = useState(1);
  const [running, setRunning] = useState(true);

  const [tick, setTick] = useState(0);
  const stateA = useRef<PendulumState>([0, 0, 0, 0]);
  const stateB = useRef<PendulumState>([0, 0, 0, 0]);
  const trail = useRef<{ x: number; y: number }[]>([]);
  const elapsed = useRef(0);
  const raf = useRef<number | null>(null);

  // Parametre değişince baştan başla; yarıda değiştirmek karşılaştırmayı
  // anlamsız kılıyor.
  useEffect(() => {
    const a = (angle * Math.PI) / 180;
    stateA.current = [a, a, 0, 0];
    // İkinci sarkaç yalnızca 0,001 rad farkla — kaosun tetikleyicisi bu.
    stateB.current = [a + 0.001, a, 0, 0];
    trail.current = [];
    elapsed.current = 0;
    setTick((t) => t + 1);
  }, [angle, l1, l2]);

  useEffect(() => {
    if (!running) return;
    let last = performance.now();
    const loop = (now: number) => {
      const frame = Math.min((now - last) / 1000, 0.05);
      last = now;
      // Sabit küçük adım: kare hızından bağımsız, tekrarlanabilir sonuç.
      const dt = 0.002;
      const steps = Math.floor(frame / dt);
      for (let i = 0; i < steps; i++) {
        stateA.current = step(stateA.current, dt, { m1: 1, m2: 1, l1, l2 });
        stateB.current = step(stateB.current, dt, { m1: 1, m2: 1, l1, l2 });
        elapsed.current += dt;
      }
      const [t1, t2] = stateA.current;
      const x = CX + Math.sin(t1) * l1 * PX_PER_M + Math.sin(t2) * l2 * PX_PER_M;
      const y = CY + Math.cos(t1) * l1 * PX_PER_M + Math.cos(t2) * l2 * PX_PER_M;
      trail.current.push({ x, y });
      if (trail.current.length > 900) trail.current.shift();
      setTick((t) => t + 1);
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [running, l1, l2]);

  const A = stateA.current;
  const B = stateB.current;
  const divergence = Math.abs(A[0] - B[0]) + Math.abs(A[1] - B[1]);

  const pos = (s: PendulumState) => {
    const x1 = CX + Math.sin(s[0]) * l1 * PX_PER_M;
    const y1 = CY + Math.cos(s[0]) * l1 * PX_PER_M;
    return {
      x1: r2(x1),
      y1: r2(y1),
      x2: r2(x1 + Math.sin(s[1]) * l2 * PX_PER_M),
      y2: r2(y1 + Math.cos(s[1]) * l2 * PX_PER_M),
    };
  };

  const pa = pos(A);
  const pb = pos(B);

  return (
    <SimShell
      id="cift-sarkac"
      title="Çift sarkaç"
      subject="Fizik"
      summary="İki sarkaç, binde bir fark. Ne kadar sürede ayrılırlar?"
      help={{
        intro:
          "Çift sarkaç kaotik bir sistemdir: başlangıç koşulundaki çok küçük bir fark zamanla katlanarak büyür. Burada iki sarkaç yalnızca 0,001 radyan farkla başlıyor.",
        steps: [
          "Bir süre izle — ikisi üst üste gidiyor, ayırt edemezsin.",
          "Birkaç saniye sonra ayrılmaya başlıyorlar; ayrışma kartındaki sayı büyüyor.",
          "Açıyı küçült (30° altı) — hareket düzenlileşir, kaos kaybolur.",
        ],
        legend: [
          { color: "#f4ae0b", label: "1. sarkaç" },
          { color: "#7aa2f7", label: "2. sarkaç (0,001 rad farkla)" },
        ],
      }}
      controls={
        <>
          <SimSlider label="Başlangıç açısı" value={angle} onChange={setAngle} min={10} max={170} step={5} unit="°" />
          <SimSlider label="Üst kol" value={l1} onChange={setL1} min={0.5} max={1.5} step={0.1} unit=" m" format={(v) => v.toFixed(1)} />
          <SimSlider label="Alt kol" value={l2} onChange={setL2} min={0.5} max={1.5} step={0.1} unit=" m" format={(v) => v.toFixed(1)} />
          <button type="button" className="sim-chip is-on" onClick={() => setRunning((r) => !r)}>
            {running ? "Durdur" : "Devam et"}
          </button>
        </>
      }
      readouts={
        <>
          <SimReadout
            label="Ayrışma"
            tone="highlight"
            rows={[
              { label: "Açı farkı", value: `${divergence.toFixed(4)} rad` },
              {
                label: "Durum",
                value: divergence < 0.01 ? "hâlâ birlikte" : divergence < 0.5 ? "ayrılıyor" : "tamamen farklı",
              },
            ]}
          />
          <SimReadout
            label="Süre"
            tone="accent"
            rows={[
              { label: "Geçen", value: `${elapsed.current.toFixed(1)} s` },
              { label: "Başlangıç farkı", value: "0,001 rad" },
            ]}
          />
          <SimReadout
            label="Açılar"
            rows={[
              { label: "Üst", value: `${((A[0] * 180) / Math.PI).toFixed(1)}°` },
              { label: "Alt", value: `${((A[1] * 180) / Math.PI).toFixed(1)}°` },
            ]}
          />
        </>
      }
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="sim-chart" role="img" aria-label={`Ayrışma ${divergence.toFixed(3)} radyan`}>
        {/* Uç noktanın izi — kaotik yörünge böyle görünüyor. */}
        <path
          d={trail.current.map((p, i) => `${i ? "L" : "M"}${r2(p.x)},${r2(p.y)}`).join(" ")}
          fill="none"
          stroke="#f4ae0b"
          strokeWidth="1"
          opacity="0.28"
        />

        <circle cx={CX} cy={CY} r="4" fill="#8a8a8a" />

        {/* İkinci sarkaç altta çiziliyor ki birinciyi kapatmasın. */}
        <line x1={CX} y1={CY} x2={pb.x1} y2={pb.y1} stroke="#7aa2f7" strokeWidth="2" opacity="0.85" />
        <line x1={pb.x1} y1={pb.y1} x2={pb.x2} y2={pb.y2} stroke="#7aa2f7" strokeWidth="2" opacity="0.85" />
        <circle cx={pb.x2} cy={pb.y2} r="7" fill="#7aa2f7" opacity="0.85" />

        <line x1={CX} y1={CY} x2={pa.x1} y2={pa.y1} stroke="#f4ae0b" strokeWidth="2.5" />
        <line x1={pa.x1} y1={pa.y1} x2={pa.x2} y2={pa.y2} stroke="#f4ae0b" strokeWidth="2.5" />
        <circle cx={pa.x1} cy={pa.y1} r="5" fill="#f4ae0b" />
        <circle cx={pa.x2} cy={pa.y2} r="8" fill="#f4ae0b" />

        <text x={12} y={H - 12} className="sim-axis">
          {tick > 0 ? `${elapsed.current.toFixed(1)} s` : ""}
        </text>
      </svg>
    </SimShell>
  );
}
