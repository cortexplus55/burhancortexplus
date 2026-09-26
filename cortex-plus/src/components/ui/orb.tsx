"use client";

import { cn } from "@/lib/utils";

type OrbState = "idle" | "speaking" | "listening" | "thinking";

function Orb({
  state = "idle",
  size = 120,
  className,
  level = 0,
}: {
  state?: OrbState;
  size?: number;
  className?: string;
  /** 0–1, speaking ölçeği için. */
  level?: number;
}) {
  const scale =
    state === "speaking" ? 1 + Math.min(0.18, Math.max(0, level) * 0.18) : 1;

  return (
    <div
      className={cn(
        "pm-orb relative isolate",
        state === "listening" && "pm-orb--violet is-listen",
        state === "thinking" && "pm-orb--violet",
        state === "idle" && "pm-orb--breathe",
        className
      )}
      style={{
        width: size,
        height: size,
        transform: `scale(${scale})`,
        transition: "transform var(--dur-fast) var(--ease-out)",
      }}
      aria-hidden
      data-state={state}
    >
      {state === "listening" ? (
        <span className="pointer-events-none absolute inset-[-12%] rounded-full border border-ai/40 animate-ping motion-reduce:animate-none" />
      ) : null}
    </div>
  );
}

export { Orb };
export type { OrbState };
