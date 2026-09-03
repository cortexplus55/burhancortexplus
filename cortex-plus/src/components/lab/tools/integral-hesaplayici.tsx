"use client";

import { useMemo, useState } from "react";
import {
  ToolField,
  ToolNumber,
  ToolShell,
  ToolSteps,
} from "@/components/lab/tool-shell";
import { compile, integrate } from "@/lib/lab/expr";
import { autoRange, curvePaths, makeScale } from "@/lib/lab/plot";

/**
 * Belirli integral hesaplayıcı.
 *
 * Fonksiyon serbest metin ve kendi ayrıştırıcımızdan geçiyor — `eval` yok
 * (bkz. lib/lab/expr.ts).
 *
 * Alanın işaretli olduğu ayrıca gösteriliyor: eksenin altında kalan bölge
 * negatif katkı veriyor ve öğrencilerin çoğu "alan" deyince mutlak değer
 * bekliyor. İkisi de yazılıyor.
 */

const round = (v: number) => Math.round(v * 100000) / 100000;

export function IntegralHesaplayici() {
  const [src, setSrc] = useState("x^2");
  const [a, setA] = useState(0);
  const [b, setB] = useState(1);

  const f = useMemo(() => compile(src), [src]);

  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const flipped = a > b;

  const value = useMemo(() => (f ? integrate(f, a, b, 400) : NaN), [f, a, b]);
  // İşaretli integral ile gerçek alan farklı; ikisini de veriyoruz.
  const area = useMemo(
    () => (f ? integrate((x) => Math.abs(f(x)), lo, hi, 400) : NaN),
    [f, lo, hi],
  );

  const range = useMemo(
    () => (f ? autoRange(f, lo - 0.2, hi + 0.2) : { yMin: -1, yMax: 1 }),
    [f, lo, hi],
  );
  const scale = makeScale(lo - 0.2, hi + 0.2, range.yMin, range.yMax, 460, 260, 30);
  const paths = useMemo(
    () =>
      f ? curvePaths(f, scale, lo - 0.2, hi + 0.2, range.yMin, range.yMax) : [],
    [f, scale, lo, hi, range],
  );

  const fill = useMemo(() => {
    if (!f || hi <= lo) return "";
    const pts: string[] = [`M${scale.px(lo)},${scale.py(0)}`];
    for (let i = 0; i <= 120; i++) {
      const x = lo + ((hi - lo) * i) / 120;
      const y = f(x);
      pts.push(`L${scale.px(x)},${scale.py(Number.isFinite(y) ? y : 0)}`);
    }
    pts.push(`L${scale.px(hi)},${scale.py(0)} Z`);
    return pts.join(" ");
  }, [f, lo, hi, scale]);

  return (
    <ToolShell
      title="İntegral hesaplayıcı"
      subject="Matematik"
      summary="Belirli integrali hesapla; eğri altındaki alanı ve işaretini gör."
      inputs={
        <>
          <ToolField label="Fonksiyon f(x)" hint="Örnek: x^2, sin(x), 1/x, e^x">
            <input
              className="tool-input tool-input--mono"
              value={src}
              onChange={(e) => setSrc(e.target.value)}
              spellCheck={false}
              autoComplete="off"
              aria-label="Fonksiyon"
            />
          </ToolField>
          <ToolNumber label="Alt sınır a" value={a} onChange={setA} step={0.5} />
          <ToolNumber label="Üst sınır b" value={b} onChange={setB} step={0.5} />
        </>
      }
      result={
        !f ? (
          <>
            <span className="tool-result-label">Anlaşılmadı</span>
            <strong className="tool-result-value tool-result-value--error">—</strong>
            <span className="tool-result-note">
              Bu ifadeyi çözemedim. x^2, sin(x), 1/x gibi yazabilirsin.
            </span>
          </>
        ) : (
          <>
            <span className="tool-result-label">
              ∫<sub>{a}</sub><sup>{b}</sup> {src} dx
            </span>
            <strong className="tool-result-value">{round(value)}</strong>
            <span className="tool-result-note">
              {flipped
                ? "Sınırlar ters olduğu için sonuç işaret değiştirdi."
                : Math.abs(value - area) > 1e-6
                  ? "Eğrinin bir kısmı eksenin altında; işaretli integral alandan farklı."
                  : "Eğri tamamen eksenin üstünde; integral doğrudan alanı veriyor."}
            </span>
          </>
        )
      }
    >
      {f ? (
        <>
          <ToolSteps
            rows={[
              { label: "İşaretli integral", value: String(round(value)) },
              { label: "Gerçek alan (|f|)", value: String(round(area)) },
              { label: "Aralık", value: `[${lo}, ${hi}]` },
              { label: "Aralık genişliği", value: String(round(hi - lo)) },
              {
                label: "Ortalama değer",
                value: hi > lo ? String(round(value / (hi - lo))) : "—",
              },
            ]}
          />

          <svg
            viewBox={`0 0 ${scale.W} ${scale.H}`}
            className="tool-chart"
            role="img"
            aria-label={`İntegral ${round(value)}`}
          >
            <path d={fill} fill="rgba(244,174,11,0.2)" />
            {range.yMin < 0 && range.yMax > 0 ? (
              <line
                x1={scale.PAD}
                x2={scale.W - scale.PAD}
                y1={scale.py(0)}
                y2={scale.py(0)}
                stroke="#4a4a4a"
                strokeWidth="1"
              />
            ) : null}
            {paths.map((d, i) => (
              <path key={i} d={d} fill="none" stroke="#f4ae0b" strokeWidth="2.5" />
            ))}
            <line
              x1={scale.px(lo)}
              x2={scale.px(lo)}
              y1={scale.PAD}
              y2={scale.H - scale.PAD}
              stroke="#7aa2f7"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
            <line
              x1={scale.px(hi)}
              x2={scale.px(hi)}
              y1={scale.PAD}
              y2={scale.H - scale.PAD}
              stroke="#7aa2f7"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
          </svg>
        </>
      ) : null}
    </ToolShell>
  );
}
