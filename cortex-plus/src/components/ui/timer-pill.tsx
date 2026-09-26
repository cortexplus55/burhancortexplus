"use client";

import { cn } from "@/lib/utils";

type TimerTone = "normal" | "warning" | "danger";

function TimerPill({
  remainingSeconds,
  className,
}: {
  remainingSeconds: number;
  className?: string;
}) {
  const safe = Math.max(0, Math.floor(remainingSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  const label = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  const tone: TimerTone =
    safe <= 60 ? "danger" : safe <= 5 * 60 ? "warning" : "normal";

  return (
    <span
      className={cn(
        "inline-flex h-8 items-center rounded-pill px-3 text-sm font-semibold tabular-nums",
        tone === "normal" && "bg-surface-2 text-[var(--c-text)]",
        tone === "warning" && "bg-warning-soft text-warning",
        tone === "danger" && "bg-danger-soft text-danger animate-pulse motion-reduce:animate-none",
        className
      )}
      role="timer"
      aria-live={tone === "danger" ? "polite" : "off"}
    >
      {label}
    </span>
  );
}

export { TimerPill };
export type { TimerTone };
