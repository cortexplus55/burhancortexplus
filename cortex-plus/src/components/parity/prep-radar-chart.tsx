import type { PrepRadarView } from "@/lib/learning/prep-radar";

const SIZE = 280;
const CX = SIZE / 2;
const CY = SIZE / 2 + 6;
const RADIUS = 92;
const RINGS = [0.25, 0.5, 0.75, 1];

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
  const n = view.axes.length;
  const valuePath = view.axes
    .map((axis, index) => {
      const p = polar(index, n, axis.pct / 100);
      return `${index === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    })
    .join(" ") + " Z";
  const targetPath = ringPath(n, view.targetScore / 100);

  return (
    <figure className={compact ? "cp-radar cp-radar--compact" : "cp-radar"}>
      <svg
        className="cp-radar-svg"
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-label={`Hazırlık skoru yüzde ${view.readinessPct}, hedef yüzde ${view.targetScore}. ${view.axes
          .map((axis) => `${axis.label} yüzde ${axis.pct}`)
          .join(", ")}`}
      >
        {RINGS.map((ratio) => (
          <path key={ratio} className="cp-radar-ring" d={ringPath(n, ratio)} />
        ))}
        {view.axes.map((_, index) => {
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
        {view.axes.map((axis, index) => {
          const p = polar(index, n, axis.pct / 100);
          const label = polar(index, n, 1.28);
          return (
            <g key={axis.id}>
              <circle className="cp-radar-dot" cx={p.x} cy={p.y} r={3.4} />
              <text
                className="cp-radar-label"
                x={label.x}
                y={label.y}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {axis.label}
              </text>
            </g>
          );
        })}
        <text className="cp-radar-score" x={CX} y={CY - 6} textAnchor="middle">
          %{view.readinessPct}
        </text>
        <text className="cp-radar-goal" x={CX} y={CY + 14} textAnchor="middle">
          hedef %{view.targetScore}
        </text>
      </svg>
      <figcaption className="cp-radar-caption">{view.label}</figcaption>
    </figure>
  );
}
