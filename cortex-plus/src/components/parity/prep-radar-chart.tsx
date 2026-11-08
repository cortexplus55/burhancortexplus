import type { PrepRadarView } from "@/lib/learning/prep-radar";
import { safePct } from "@/lib/learning/chart-safe";

const SIZE = 280;
const CX = SIZE / 2;
const CY = SIZE / 2 + 6;
const RADIUS = 92;
const RINGS = [0.25, 0.5, 0.75, 1];
/**
 * Yan etiketlerin payı (8 Kasım 2026): etiketler ortalanıp 280 birimlik kutuya sığmıyordu, solda "Tempo & Düzen"
 * "mpo & Düzen" diye kesiliyordu. Yan etiketler grafikten dışa doğru hizalanır ve kutu iki yana genişler.
 */
const PAD_X = 104;

function polar(index: number, total: number, ratio: number) {
  const angle = -Math.PI / 2 + (index / total) * Math.PI * 2;
  return {
    x: CX + Math.cos(angle) * RADIUS * ratio,
    y: CY + Math.sin(angle) * RADIUS * ratio,
  };
}

function ringPath(total: number, ratio: number) {
  return Array.from({ length: total }, (_, index) => {
    const p = polar(index, total, ratio);
    return `${index === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  }).join(" ") + " Z";
}

export function PrepRadarChart({
  view,
  compact = false,
}: {
  view: PrepRadarView;
  compact?: boolean;
}) {
  const axes = (Array.isArray(view?.axes) ? view.axes : []).map((axis) => ({
    ...axis,
    pct: safePct(axis?.pct),
  }));
  const readinessPct = safePct(view?.readinessPct);
  const targetScore = safePct(view?.targetScore);
  const n = axes.length;
  if (n < 3) return null;
  const valuePath = axes
    .map((axis, index) => {
      const p = polar(index, n, axis.pct / 100);
      return `${index === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    })
    .join(" ") + " Z";
  const targetPath = ringPath(n, targetScore / 100);

  return (
    <figure className={compact ? "cp-radar cp-radar--compact" : "cp-radar"}>
      <svg
        className="cp-radar-svg"
        viewBox={`${-PAD_X} 0 ${SIZE + PAD_X * 2} ${SIZE}`}
        role="img"
        aria-label={`Hazırlık skoru yüzde ${readinessPct}, hedef yüzde ${targetScore}. ${axes
          .map((axis) => `${axis.label} yüzde ${axis.pct}`)
          .join(", ")}`}
      >
        {RINGS.map((ratio) => (
          <path key={ratio} className="cp-radar-ring" d={ringPath(n, ratio)} />
        ))}
        {axes.map((_, index) => {
          const tip = polar(index, n, 1);
          return (
            <line
              key={index}
              className="cp-radar-spoke"
              x1={CX}
              y1={CY}
              x2={tip.x}
              y2={tip.y}
            />
          );
        })}
        <path className="cp-radar-target" d={targetPath} />
        <path className="cp-radar-fill" d={valuePath} />
        {axes.map((axis, index) => {
          const p = polar(index, n, axis.pct / 100);
          const label = polar(index, n, 1.16);
          const side = label.x < CX - 8 ? "end" : label.x > CX + 8 ? "start" : "middle";
          const nudge = side === "end" ? -6 : side === "start" ? 6 : 0;
          return (
            <g key={axis.id}>
              <circle className="cp-radar-dot" cx={p.x} cy={p.y} r={3.4} />
              {/* Çizimde ad yerine numara, ad ve yüzde alttaki listede (8 Kasım 2026): telefonda ad 8 px'e iniyor,
                  masaüstünde iki kez yazıyordu. */}
              <text
                className="cp-radar-num"
                x={label.x + nudge}
                y={side === "middle" ? label.y + (label.y < CY ? -6 : 6) : label.y}
                textAnchor={side}
                dominantBaseline="middle"
              >
                {index + 1}
              </text>
            </g>
          );
        })}
        <text className="cp-radar-score" x={CX} y={CY - 6} textAnchor="middle">
          %{readinessPct}
        </text>
        <text className="cp-radar-goal" x={CX} y={CY + 14} textAnchor="middle">
          hedef %{targetScore}
        </text>
      </svg>
      <ol className="cp-radar-legend">
        {axes.map((axis, index) => (
          <li key={axis.id}>
            <span className="cp-radar-legend-num" aria-hidden>
              {index + 1}
            </span>
            <span className="cp-radar-legend-label">{axis.label}</span>
            <strong>%{axis.pct}</strong>
          </li>
        ))}
      </ol>
      <figcaption className="cp-radar-caption">{view.label}</figcaption>
    </figure>
  );
}
