"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { LESSON_PREP_STEPS } from "@/lib/learning/lesson-chrome";

/**
 * Ders üretilirken ne olduğunu göstermek.
 *
 * Önceden buton yazısı "Hazırlanıyor…" oluyordu ve öğrenci 30–60 saniye boş
 * ekrana bakıyordu. Asıl kayıp bekleme değil, güven: dersin kendi ders
 * notundan çıktığını gösteren tek bir işaret yoktu. Adımlar sunucudaki gerçek
 * sırayı anlatıyor; son adım gerçekten cevap gelene kadar döner.
 */

export function NodeGenerationProgress({
  onClose,
}: {
  /** Çağıran hâlâ geçirebilir; adım metni dosya adını içermez. */
  sourceName?: string | null;
  onClose?: () => void;
}) {
  const steps = [...LESSON_PREP_STEPS];

  const [reached, setReached] = useState(0);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    // Son adım cevabı beklediği için kendiliğinden tamamlanmaz.
    const timer = setInterval(
      () => setReached((value) => Math.min(value + 1, steps.length - 1)),
      1600,
    );
    const slowTimer = setTimeout(() => setSlow(true), 25000);
    return () => {
      clearInterval(timer);
      clearTimeout(slowTimer);
    };
  }, [steps.length]);

  return (
    <article className="apg" role="status" aria-live="polite">
      {onClose ? (
        <button type="button" className="apg-close" onClick={onClose} aria-label="Kapat">
          <X className="h-4 w-4" />
        </button>
      ) : null}
      <div className="apg-sphere" aria-hidden>
        {Array.from({ length: 42 }, (_, dot) => (
          <span
            key={dot}
            style={{
              transform: `rotate(${dot * 25.7}deg) translateY(${2.1 + (dot % 5) * 0.28}rem)`,
              animationDelay: `${(dot % 7) * 0.18}s`,
            }}
          />
        ))}
      </div>
      <h1>Dersin hazırlanıyor...</h1>
      <ul className="apg-steps">
        {steps.map((label, index) => {
          const done = index < reached;
          const active = index === reached;
          return (
            <li
              key={label}
              className={done ? "is-done" : active ? "is-active" : undefined}
            >
              <span className="apg-dot" aria-hidden>
                {done ? (
                  <Check className="h-3 w-3" />
                ) : active ? (
                  <Loader2 className="h-3 w-3 apg-spin" />
                ) : null}
              </span>
              {label}
            </li>
          );
        })}
      </ul>
      {slow ? (
        <p className="apg-slow">
          Beklenenden uzun sürüyor — hâlâ üzerinde çalışıyoruz. Sayfayı kapatsan
          da ders hazırlanmaya devam eder.
        </p>
      ) : null}
    </article>
  );
}
