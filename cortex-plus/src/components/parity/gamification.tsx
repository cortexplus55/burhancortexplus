"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import "@/styles/parity-app.css";

const STORAGE_KEY = "cortex-gamification-v1";

/*
  Tek seferlik seri karşılaması.

  Eskiden ikinci bir ekran "İlk Roket açıldı! Sıradaki rozetler seni
  bekliyor" diyordu; oysa kodda rozet sistemi yok — açılan bir şey, sırada
  bekleyen bir rozet yok. Öğrenciye tutulmayacak bir söz veriliyordu; ekran
  kaldırıldı. Rozetler artık gerçek (lib/gamification/badges.ts); yeni
  açılan rozeti BadgeUnlockNotice duyuruyor, bu karşılama değil.

  Seri yalnızca soru sormakla değil, ders, test, sözlü, tekrar ve deneme
  tamamlamakla da ilerliyor (recordUserActivity çağıranları) — metin de
  bunu söylüyor.
*/
export function GamificationGate() {
  const [step, setStep] = useState<"none" | "streak">("none");
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

  if (step === "none") return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Seri"
    >
      <div className="cs-app cs-pay-card w-full max-w-sm p-6 text-center">
        <p className="text-4xl" aria-hidden>
          🔥
        </p>
        <h2 className="mt-3 text-xl font-semibold">
          {streakDays > 1 ? `${streakDays} günlük serin devam ediyor!` : "Serini başlattın!"}
        </h2>
        <p className="mt-2 text-sm text-[var(--cs-muted)]">
          Her gün bir ders, test ya da soru — hangisi olursa — serini canlı tutar.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Button
            type="button"
            className="cs-btn-primary w-full rounded-full"
            onClick={dismiss}
          >
            Devam et
          </Button>
          <Link
            href="/ilerleme"
            className="text-sm text-[var(--cs-primary)] underline underline-offset-2"
            onClick={dismiss}
          >
            İlerlemeni gör
          </Link>
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
