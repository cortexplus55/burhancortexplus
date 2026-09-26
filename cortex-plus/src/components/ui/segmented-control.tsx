"use client";

import { cn } from "@/lib/utils";

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
  ariaLabel,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  ariaLabel: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "inline-flex h-11 items-center gap-1 rounded-[var(--r-md)] border border-[var(--c-border)] bg-surface-2 p-1",
        className
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            className={cn(
              "h-9 min-w-[4.5rem] rounded-[var(--r-sm)] px-3 text-14 font-semibold transition-colors duration-fast",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-focus)]",
              active
                ? "bg-surface-3 text-[var(--c-text)]"
                : "text-[var(--c-text-muted)] hover:text-[var(--c-text)]"
            )}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export { SegmentedControl };
