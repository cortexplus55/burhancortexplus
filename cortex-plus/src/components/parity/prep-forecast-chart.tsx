import type { ReadinessForecastSeries } from "@/lib/learning/prep-radar";

const VB_W = 360;
const VB_H = 168;
const PAD = { top: 18, right: 16, bottom: 28, left: 36 };

export function PrepForecastChart({ series }: { series: ReadinessForecastSeries }) {
  const innerW = VB_W - PAD.left - PAD.right;
  const innerH = VB_H - PAD.top - PAD.bottom;
  const maxX = Math.max(1, series.horizonDays);
  const xOf = (day: number) => PAD.left + (day / maxX) * innerW;
  const yOf = (pct: number) => PAD.top + (1 - pct / 100) * innerH;
  const line = series.points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${xOf(point.day).toFixed(1)} ${yOf(point.pct).toFixed(1)}`)
    .join(" ");
  const targetY = yOf(series.targetPct);
  const ticks = [0, 50, 100];

  return (
    <figure className="cp-forecast">
      <svg
        className="cp-forecast-svg"
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        role="img"
        aria-label={`Hazırlık tahmini: bugün yüzde ${series.currentPct}, ${series.horizonDays} gün sonra yüzde ${series.points[series.points.length - 1]?.pct ?? series.currentPct}, hedef yüzde ${series.targetPct}`}
      >
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              className="cp-forecast-grid"
              x1={PAD.left}
              x2={VB_W - PAD.right}
              y1={yOf(tick)}
              y2={yOf(tick)}
            />
            <text className="cp-forecast-tick" x={PAD.left - 8} y={yOf(tick) + 3} textAnchor="end">
              {tick}
            </text>
          </g>
        ))}
        <line
          className="cp-forecast-target"
          x1={PAD.left}
          x2={VB_W - PAD.right}
          y1={targetY}
          y2={targetY}
        />
        <text className="cp-forecast-target-label" x={VB_W - PAD.right} y={targetY - 6} textAnchor="end">
          Hedef (%{series.targetPct})
        </text>
        <path className="cp-forecast-line" d={line} />
        <circle
          className="cp-forecast-now"
          cx={xOf(0)}
          cy={yOf(series.currentPct)}
          r={4}
        />
        <text className="cp-forecast-axis" x={PAD.left} y={VB_H - 8}>
          Bugün
        </text>
        <text className="cp-forecast-axis" x={VB_W - PAD.right} y={VB_H - 8} textAnchor="end">
          {series.horizonDays} gün
        </text>
      </svg>
      <figcaption className="cp-forecast-caption">
        Readiness %{series.currentPct}
        {series.hitsTargetOn != null && series.hitsTargetOn > 0
          ? ` · hedefe ~${series.hitsTargetOn} günde`
          : series.hitsTargetOn === 0
            ? " · hedef bandındasın"
            : " · bu tempoyla hedefe henüz ulaşılmaz"}
      </figcaption>
    </figure>
  );
}
