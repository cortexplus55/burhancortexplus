"use client";

import { useEffect, useState } from "react";
import { Check, Info, Loader2, X } from "lucide-react";
import { CortexMark } from "@/components/brand/cortex-mark";
import { LESSON_PREP_STEPS } from "@/lib/learning/lesson-chrome";

/**
 * Ders üretilirken ne olduğunu göstermek.
 *
 * Önceden buton yazısı "Hazırlanıyor…" oluyordu ve öğrenci 30–60 saniye boş
 * ekrana bakıyordu. Asıl kayıp bekleme değil, güven: dersin kendi ders
 * notundan çıktığını gösteren tek bir işaret yoktu. Adımlar sunucudaki gerçek
 * sırayı anlatıyor; son adım gerçekten cevap gelene kadar döner.
 */

const SPHERE_DOTS = buildSphere(168);

function buildSphere(count: number) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  const dots: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < count; i += 1) {
    const y = 1 - (i / (count - 1)) * 2;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    dots.push({
      x: Math.cos(theta) * radius,
      y,
      z: Math.sin(theta) * radius,
    });
  }
  return dots;
}

export function NodeGenerationProgress({
  onClose,
  title = "Dersin hazırlanıyor…",
}: {
  /** Çağıran hâlâ geçirebilir; adım metni dosya adını içermez. */
  sourceName?: string | null;
  onClose?: () => void;
  /** Sözlü deneme aynı adımları kendi başlığıyla gösterir. */
  title?: string;
}) {
  const steps = [...LESSON_PREP_STEPS];

  const [reached, setReached] = useState(0);
  const [slow, setSlow] = useState(false);
  const [hint, setHint] = useState(true);

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
      <div className="apg-head">
        <h1>{title}</h1>
        <CortexMark size={18} />
      </div>
      <div className="apg-sphere" aria-hidden>
        {SPHERE_DOTS.map((dot, index) => (
          <span
            key={index}
            style={{
              transform: `translate3d(${dot.x * 92}px, ${dot.y * 92}px, ${dot.z * 40}px)`,
              opacity: 0.28 + ((dot.z + 1) / 2) * 0.72,
              animationDelay: `${(index % 8) * 0.16}s`,
            }}
          />
        ))}
      </div>
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
      {hint ? (
        <div className="apg-toast">
          <Info className="h-4 w-4" aria-hidden />
          <p>Bu işlem birkaç dakika sürebilir.</p>
          <button type="button" onClick={() => setHint(false)} aria-label="Bildirimi kapat">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
    </article>
  );
}
