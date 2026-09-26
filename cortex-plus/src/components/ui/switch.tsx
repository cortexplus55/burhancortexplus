"use client";

import { cn } from "@/lib/utils";

function Switch({
  checked,
  onCheckedChange,
  disabled,
  id,
  "aria-label": ariaLabel,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  "aria-label": string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      className={cn(
        "relative inline-flex h-11 w-[52px] shrink-0 items-center rounded-pill border border-transparent px-1 transition-colors duration-fast",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-focus)]",
        "disabled:opacity-45",
        checked ? "bg-action" : "bg-surface-3",
        className
      )}
      onClick={() => onCheckedChange(!checked)}
    >
      <span
        className={cn(
          "size-7 rounded-full bg-white shadow-sh-1 transition-transform duration-fast",
          checked ? "translate-x-[18px]" : "translate-x-0"
        )}
      />
    </button>
  );
}

function Radio({
  checked,
  onChange,
  disabled,
  name,
  value,
  id,
  "aria-label": ariaLabel,
  className,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  name?: string;
  value?: string;
  id?: string;
  "aria-label": string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      id={id}
      name={name}
      value={value}
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      className={cn(
        "inline-flex size-11 items-center justify-center rounded-full",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-focus)]",
        "disabled:opacity-45",
        className
      )}
      onClick={onChange}
    >
      <span
        className={cn(
          "flex size-5 items-center justify-center rounded-full border-2",
          checked ? "border-action" : "border-[var(--c-border-strong)]"
        )}
      >
        {checked ? <span className="size-2.5 rounded-full bg-action" /> : null}
      </span>
    </button>
  );
}

export { Switch, Radio };
