"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const OPTION_LETTERS = ["A", "B", "C", "D"] as const;

const optionCardVariants = cva(
  [
    "group/option flex w-full items-start gap-3 rounded-[var(--r-xl)] border px-4 py-3 text-left",
    "transition-[border-color,background-color,opacity,transform] duration-fast ease-out",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-focus)]",
    "disabled:pointer-events-none",
  ].join(" "),
  {
    variants: {
      state: {
        idle: "border-[var(--c-border)] bg-surface-1 text-[var(--c-text)] hover:border-[var(--c-border-strong)] hover:bg-surface-2",
        hover: "border-[var(--c-border-strong)] bg-surface-2 text-[var(--c-text)]",
        selected: "border-action bg-action-soft text-[var(--c-text)]",
        correct: "border-success bg-success-soft text-[var(--c-text)]",
        incorrect: "border-danger bg-danger-soft text-[var(--c-text)]",
        missed: "border-warning/60 bg-warning-soft text-[var(--c-text)]",
        dimmed: "border-[var(--c-border)] bg-surface-1 text-[var(--c-text-muted)] opacity-55",
      },
    },
    defaultVariants: {
      state: "idle",
    },
  }
);

type OptionCardProps = {
  index: number;
  label: React.ReactNode;
  state?: VariantProps<typeof optionCardVariants>["state"];
  selected?: boolean;
  multi?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
  className?: string;
  id?: string;
};

function optionLetter(index: number): string {
  return OPTION_LETTERS[index] ?? String(index + 1);
}

function OptionCard({
  index,
  label,
  state = "idle",
  selected = false,
  multi = false,
  disabled = false,
  onSelect,
  className,
  id,
}: OptionCardProps) {
  const resolved = selected && state === "idle" ? "selected" : state;
  const letter = optionLetter(index);

  return (
    <button
      type="button"
      id={id}
      role={multi ? "checkbox" : "radio"}
      aria-checked={selected}
      disabled={disabled || resolved === "dimmed"}
      data-state={resolved}
      data-letter={letter}
      className={cn(optionCardVariants({ state: resolved }), className)}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key.toUpperCase() === letter && onSelect) {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
          resolved === "selected" || resolved === "correct"
            ? "bg-action text-action-foreground"
            : resolved === "incorrect"
              ? "bg-danger text-white"
              : "bg-surface-3 text-[var(--c-text)]"
        )}
        aria-hidden
      >
        {letter}
      </span>
      <span className="min-w-0 flex-1 text-[15px] leading-relaxed">{label}</span>
    </button>
  );
}

export { OptionCard, optionCardVariants, optionLetter, OPTION_LETTERS };
export type { OptionCardProps };
