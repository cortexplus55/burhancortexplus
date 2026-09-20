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
    <div
      className={cn(
        "signup-wizard onboarding-shell mx-auto w-full max-w-md pb-16",
        className,
      )}
    >
      <div className="onboarding-ambient" aria-hidden>
        <span className="onboarding-ambient__orb onboarding-ambient__orb--a" />
        <span className="onboarding-ambient__orb onboarding-ambient__orb--b" />
        <span className="onboarding-ambient__vignette" />
        <span className="onboarding-ambient__grain" />
      </div>

      <div className="onboarding-stage">
        <div
          className="signup-progress-track w-full overflow-hidden rounded-full"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Onboarding ilerlemesi, adım ${step} / ${total}`}
        >
          <div
            className="signup-progress-fill"
            style={{ width: `${progress}%` }}
          />
        </div>

        <ol className="onboarding-steps" aria-label="Onboarding adımları">
          {Array.from({ length: total }, (_, i) => {
            const n = i + 1;
            const state = n < step ? "done" : n === step ? "current" : "todo";
            return (
              <li
                key={n}
                className="onboarding-steps__item"
                data-state={state}
                aria-current={state === "current" ? "step" : undefined}
              >
                <span className="onboarding-steps__dot" aria-hidden>
                  {n < step ? "✓" : n}
                </span>
                <span className="onboarding-steps__label">Adım {n}</span>
              </li>
            );
          })}
        </ol>

        <header className="onboarding-stage__header">
          {onBack ? (
            <button
              type="button"
              className="onboarding-back"
              onClick={onBack}
              aria-label="Önceki adım"
            >
              <ArrowLeft className="h-4 w-4" />
              Geri
            </button>
          ) : (
            <span aria-hidden className="w-16" />
          )}
          <span className="onboarding-stage__count">
            {step} / {total}
          </span>
        </header>

        <div key={step} className="onboarding-step-enter mt-5">
          {children}
        </div>
      </div>
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
