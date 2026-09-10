"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";

/**
 * Ders üretilirken ne olduğunu göstermek.
 *
 * Önceden buton yazısı "Hazırlanıyor…" oluyordu ve öğrenci 30–60 saniye boş
 * ekrana bakıyordu. Asıl kayıp bekleme değil, güven: dersin kendi ders
 * notundan çıktığını gösteren tek bir işaret yoktu. Adımlar sunucudaki gerçek
 * sırayı anlatıyor; son adım gerçekten cevap gelene kadar döner.
 */

const BASE_STEPS = [
  "Konu okunuyor",
  "Bildiklerin gözden geçiriliyor",
  "Zorluk sana göre ayarlanıyor",
  "Sorular seçiliyor",
];

export function NodeGenerationProgress({
  sourceName,
}: {
  /** Hazırlık bir belgeye bağlıysa dosya adı; değilse son adım gösterilmez. */
  sourceName?: string | null;
}) {
  const steps = sourceName
    ? [...BASE_STEPS, `“${sourceName}” ile karşılaştırılıyor`]
    : BASE_STEPS;

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
      <div className="apg-orb" aria-hidden />
      <h1>Dersin hazırlanıyor</h1>
      <p className="apg-lead">Bir dakika kadar sürebilir.</p>
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
