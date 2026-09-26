"use client";

import { cn } from "@/lib/utils";

function ProgressBar({
  value,
  max = 100,
  className,
  label,
}: {
  value: number;
  max?: number;
  className?: string;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, max <= 0 ? 0 : (value / max) * 100));
  return (
    <div
      className={cn("h-2 w-full overflow-hidden rounded-pill bg-surface-3", className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div
        className="h-full rounded-pill bg-action transition-[width] duration-count ease-out motion-reduce:transition-none"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function ProgressSegments({
  total,
  current,
  className,
}: {
  total: number;
  current: number;
  className?: string;
}) {
  const safeTotal = Math.max(1, total);
  return (
    <div
      className={cn("flex w-full gap-1.5", className)}
      role="progressbar"
      aria-valuenow={current}
      aria-valuemin={0}
      aria-valuemax={safeTotal}
      aria-label={`Adım ${current} / ${safeTotal}`}
    >
      {Array.from({ length: safeTotal }, (_, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 flex-1 rounded-pill transition-colors duration-fast",
            i < current ? "bg-action" : "bg-surface-3"
          )}
        />
      ))}
    </div>
  );
}

export { ProgressBar, ProgressSegments };
