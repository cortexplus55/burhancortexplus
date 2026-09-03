"use client";

/**
 * Dairesel ilerleme halkası.
 *
 * Astra'nın "konu hakimiyeti %63" ve geri sayım halkalarında kullandığı
 * motifin bizim sürümü: aynı okunabilirlik, kendi renk sistemimizle.
 * Değer değiştiğinde dolgu CSS transition ile akıyor; strokeDashoffset
 * doğrudan hesaplanıyor, animasyon kütüphanesi gerekmiyor.
 */
export function ProgressRing({
  value,
  size = 88,
  strokeWidth = 8,
  color = "var(--pm-amber-500)",
  trackColor = "var(--pm-ring-track)",
  children,
}: {
  /** 0-100 arası. */
  value: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  children?: React.ReactNode;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);

  return (
    <div
      className="pm-ring"
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
        />
        <circle
          className="pm-ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="pm-ring-content">{children}</div>
    </div>
  );
}
