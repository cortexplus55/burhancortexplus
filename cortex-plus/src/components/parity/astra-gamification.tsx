"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import "@/styles/astra-app.css";

const STORAGE_KEY = "cortex-gamification-v1";

export function AstraGamificationGate() {
  const [step, setStep] = useState<"none" | "streak" | "badge">("none");
  const [streakDays, setStreakDays] = useState(1);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY)) return;
    } catch {
      /* ignore */
    }

    let cancelled = false;
    fetch("/api/streak")
      .then(async (res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        const days = Math.max(1, Number(data?.streak ?? 1) || 1);
        setStreakDays(days);
        try {
          localStorage.setItem("cortex-streak-days", String(days));
        } catch {
          /* ignore */
        }
        setStep("streak");
      })
      .catch(() => {
        if (!cancelled) setStep("streak");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setStep("none");
  }

  function continueFromStreak() {
    setStep("badge");
  }

  if (step === "none") return null;

  if (step === "streak") {
    return (
      <div
        className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
        role="dialog"
        aria-modal="true"
        aria-label="Seri"
      >
        <div className="astra-app astra-pay-card w-full max-w-sm p-6 text-center">
          <p className="text-4xl" aria-hidden>
            🔥
          </p>
          <h2 className="mt-3 text-xl font-semibold">
            {streakDays > 1 ? `${streakDays} günlük serin devam ediyor!` : "Serini başlattın!"}
          </h2>
          <p className="mt-2 text-sm text-[var(--astra-muted)]">
            Her gün en az bir soru sorarak serini canlı tut.
          </p>
          <Button
            type="button"
            className="astra-btn-primary mt-6 w-full rounded-full"
            onClick={continueFromStreak}
          >
            Devam et
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Başarı"
    >
      <div className="astra-app astra-pay-card w-full max-w-sm p-6 text-center">
        <p className="text-4xl" aria-hidden>
          🚀
        </p>
        <h2 className="mt-3 text-xl font-semibold">İlk Roket açıldı!</h2>
        <p className="mt-2 text-sm text-[var(--astra-muted)]">
          Cortex Plus yolculuğuna başladın. Sıradaki rozetler seni bekliyor.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Link
            href="/ilerleme"
            className="text-sm text-[var(--astra-primary)] underline underline-offset-2"
            onClick={dismiss}
          >
            Hikâyeyi gör
          </Link>
          <Button
            type="button"
            className="astra-btn-primary w-full rounded-full"
            onClick={dismiss}
          >
            Devam et
          </Button>
        </div>
      </div>
    </div>
  );
}

export function readStreakFromStorage(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = localStorage.getItem("cortex-streak-days");
    return raw ? Number(raw) || 0 : 0;
  } catch {
    return 0;
  }
}
