"use client";

import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import "@/styles/signup-wizard.css";

export function OnboardingShell({
  step,
  total,
  onBack,
  children,
  className,
}: {
  step: number;
  total: number;
  onBack?: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const progress = Math.round((step / total) * 100);

  return (
    <div className={cn("signup-wizard onboarding-shell mx-auto w-full max-w-md pb-16", className)}>
      <div
        className="signup-progress-track w-full rounded-full overflow-hidden"
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Onboarding ilerlemesi, adım ${step} / ${total}`}
      >
        <div className="signup-progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <header className="mt-4 flex items-center justify-between gap-3">
        {onBack ? (
          <button
            type="button"
            className="flex items-center gap-1 rounded-full p-2 text-sm text-[var(--mk-muted)] transition-colors hover:bg-white/5 hover:text-[var(--mk-text)]"
            onClick={onBack}
            aria-label="Önceki adım"
          >
            <ArrowLeft className="h-4 w-4" />
            Geri
          </button>
        ) : (
          <span aria-hidden className="w-16" />
        )}
        <span className="text-xs text-[var(--mk-muted)]">
          Adım {step} / {total}
        </span>
      </header>
      <div className="mt-6">{children}</div>
    </div>
  );
}

export function OnboardingChoice({
  selected,
  onClick,
  children,
  className,
  ariaLabel,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={selected}
      data-selected={selected}
      className={cn("signup-choice relative w-full text-left", className)}
    >
      {children}
    </button>
  );
}

export function OnboardingContinue({
  disabled,
  onClick,
  label = "Devam",
}: {
  disabled?: boolean;
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="signup-continue mt-8"
    >
      {label}
    </button>
  );
}
