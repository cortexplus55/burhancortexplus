"use client";

import { useMemo, useState } from "react";
import { SimChips, SimReadout, SimShell } from "@/components/lab/sim-shell";
import { FnInput } from "@/components/lab/fn-input";
import { Axes, fmt } from "@/components/lab/sims/turev-teget";
import { compile, derivative, type Expr } from "@/lib/lab/expr";
import { autoRange, curvePaths, makeScale } from "@/lib/lab/plot";

/**
 * Fonksiyon analizi.
 *
 * f, f′ ve f″ aynı x ekseninde alt alta. Amaç tek bir ilişkiyi görünür
 * kılmak: f′ sıfırdan geçtiği yerde f'in tepesi ya da çukuru var, f″ işaret
 * değiştirdiği yerde f'in bükümü değişiyor.
 *
 * Üç grafik ÜST ÜSTE değil ALT ALTA çiziliyor ve x eksenleri hizalı —
 * aynı eksende çizmek ölçek farkı yüzünden f'i düzleştiriyordu.
 */

const W = 560;
const ROW_H = 110;
const PAD = 26;

export function FonksiyonAnaliziLab() {
  const [src, setSrc] = useState("x^3-3x");
  const [span, setSpan] = useState("5");

  const f = useMemo(() => compile(src), [src]);
  const xMax = Number(span);
  const xMin = -xMax;

  const rows = useMemo(() => {
    if (!f) return null;
    const d1: Expr = (x) => derivative(f, x, 1);
    const d2: Expr = (x) => derivative(f, x, 2);
    return [
      { key: "f", label: "f(x)", fn: f, color: "#f4ae0b" },
      { key: "d1", label: "f′(x)", fn: d1, color: "#54c594" },
      { key: "d2", label: "f″(x)", fn: d2, color: "#7aa2f7" },
    ];
  }, [f]);

  // Kritik noktalar: f′ işaret değiştirdiği yerler.
  const critical = useMemo(() => {
    if (!f) return [];
    const found: { x: number; kind: string }[] = [];
    const steps = 600;
    let prev = derivative(f, xMin, 1);
    for (let i = 1; i <= steps; i++) {
      const x = xMin + ((xMax - xMin) * i) / steps;
      const cur = derivative(f, x, 1);
      if (Number.isFinite(prev) && Number.isFinite(cur) && prev * cur < 0) {
        const second = derivative(f, x, 2);
        found.push({
          x,
          kind: second > 0 ? "yerel minimum" : second < 0 ? "yerel maksimum" : "dönüm",
        });
      }
      prev = cur;
    }
    return found.slice(0, 4);
  }, [f, xMin, xMax]);

  if (!f || !rows) {
    return (
      <SimShell
        id="fonksiyon-analizi"
        title="Fonksiyon analizi"
        subject="Matematik"
        summary="f, f′ ve f″ yan yana."
        help={{ intro: "Bir fonksiyon yaz.", steps: ["Örnek: x^3-3x"] }}
        controls={<FnInput value={src} onChange={setSrc} />}
      >
        <p className="sim-error">Bu ifadeyi anlayamadım.</p>
      </SimShell>
    );
  }

  return (
    <SimShell
      id="fonksiyon-analizi"
      title="Fonksiyon analizi"
      subject="Matematik"
      summary="f′ sıfırlanınca f'in tepesi var. Üçünü aynı anda gör."
      help={{
        intro:
          "Bir fonksiyonun türevi eğimini, ikinci türevi bükümünü anlatır. Üçü alt alta çizilince aralarındaki ilişki tek bakışta okunur.",
        steps: [
          "f′ x eksenini kestiği yere bak — f orada tepe ya da çukur yapar.",
          "f″ işaret değiştirdiği yerde f'in bükümü ters döner (dönüm noktası).",
          "f″ pozitifken f içbükey yukarı, negatifken içbükey aşağıdır.",
        ],
        legend: [
          { color: "#f4ae0b", label: "f(x)" },
          { color: "#54c594", label: "f′(x)" },
          { color: "#7aa2f7", label: "f″(x)" },
        ],
      }}
      controls={
        <>
          <FnInput value={src} onChange={setSrc} />
          <SimChips
            label="x aralığı"
            value={span}
            options={[
              { id: "2", label: "±2" },
              { id: "5", label: "±5" },
              { id: "10", label: "±10" },
            ]}
            onChange={setSpan}
          />
        </>
      }
      readouts={
        <>
          <SimReadout
            label="Kritik noktalar"
            tone="highlight"
            rows={
              critical.length
                ? critical.map((c) => ({
                    label: `x = ${c.x.toFixed(2)}`,
                    value: c.kind,
                  }))
                : [{ label: "Bulunamadı", value: "bu aralıkta" }]
            }
          />
          <SimReadout
            label="x = 0 değerleri"
            tone="accent"
            rows={[
              { label: "f(0)", value: fmt(f(0)) },
              { label: "f′(0)", value: fmt(derivative(f, 0, 1)) },
            ]}
          />
          <SimReadout
            label="Büküm"
            rows={[
              { label: "f″(0)", value: fmt(derivative(f, 0, 2)) },
              {
                label: "Yön",
                value:
                  derivative(f, 0, 2) > 0
                    ? "içbükey yukarı"
                    : derivative(f, 0, 2) < 0
                      ? "içbükey aşağı"
                      : "düz",
              },
            ]}
          />
        </>
      }
    >
      <div className="sim-rows">
        {rows.map((row) => {
          const range = autoRange(row.fn, xMin, xMax);
          const scale = makeScale(xMin, xMax, range.yMin, range.yMax, W, ROW_H, PAD);
          const paths = curvePaths(
            row.fn,
            scale,
            xMin,
            xMax,
            range.yMin,
            range.yMax,
            300,
          );
          return (
            <div key={row.key} className="sim-row">
              <span className="sim-row-label" style={{ color: row.color }}>
                {row.label}
              </span>
              <svg
                viewBox={`0 0 ${W} ${ROW_H}`}
                className="sim-chart"
                role="img"
                aria-label={row.label}
              >
                <Axes scale={scale} xMin={xMin} xMax={xMax} yMin={range.yMin} yMax={range.yMax} />
                {paths.map((d, i) => (
                  <path key={i} d={d} fill="none" stroke={row.color} strokeWidth="2" />
                ))}
                {/* Kritik noktalar üç grafikte de aynı x'te — ilişkiyi
                    okunur kılan şey bu hizalama. */}
                {critical.map((c, i) => (
                  <line
                    key={i}
                    x1={scale.px(c.x)}
                    x2={scale.px(c.x)}
                    y1={PAD}
                    y2={ROW_H - PAD}
                    stroke="#8a8a8a"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                    opacity="0.5"
                  />
                ))}
              </svg>
            </div>
          );
        })}
      </div>
    </SimShell>
  );
}
