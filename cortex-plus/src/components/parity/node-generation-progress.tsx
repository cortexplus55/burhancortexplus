"use client";

import { useEffect, useState } from "react";
import { Check, Info, Loader2, X } from "lucide-react";
import { CortexLogoMotion } from "@/components/brand/cortex-logo-motion";
import { LESSON_PREP_STEPS } from "@/lib/learning/lesson-chrome";

/**
 * Ders üretilirken ne olduğunu göstermek.
 *
 * Önceden buton yazısı "Hazırlanıyor…" oluyordu ve öğrenci 30–60 saniye boş
 * ekrana bakıyordu. Asıl kayıp bekleme değil, güven: dersin kendi ders
 * notundan çıktığını gösteren tek bir işaret yoktu. Adımlar sunucudaki gerçek
 * sırayı anlatıyor; son adım gerçekten cevap gelene kadar döner.
 */

/** Bekleme ekranının başlığı etkinliğin türüne göre; test açılırken "Dersin hazırlanıyor…" yazmasın. */
const PREPARING_TITLE: Record<string, string> = {
  lesson: "Dersin hazırlanıyor…",
  quiz: "Testin hazırlanıyor…",
  true_false: "Doğru/yanlış soruların hazırlanıyor…",
  flashcards: "Kartların hazırlanıyor…",
  spaced: "Kartların hazırlanıyor…",
  podcast: "Podcast hazırlanıyor…",
  qa: "Soru-cevap hazırlanıyor…",
  focused: "Alıştırman hazırlanıyor…",
  gaps: "Bilgi boşlukların hazırlanıyor…",
  final_check: "Son kontrolün hazırlanıyor…",
  written_exam: "Yazılı deneme hazırlanıyor…",
  oral: "Sözlü deneme sınavı oluşturuluyor",
};

export function preparingTitle(kind: string | null | undefined): string {
  return (kind && PREPARING_TITLE[kind]) || "Hazırlanıyor…";
}

export function NodeGenerationProgress({
  onClose,
  title = "Dersin hazırlanıyor…",
  sourceChips = [],
  note,
}: {
  /** Çağıran hâlâ geçirebilir; adım metni dosya adını içermez. */
  sourceName?: string | null;
  onClose?: () => void;
  /** Sözlü deneme aynı adımları kendi başlığıyla gösterir. */
  title?: string;
  /** Okunan dosya çipleri — 1. adımın altında. */
  sourceChips?: string[];
  /** Ek durum notu (ör. üretim yuvaları dolu: "sıradasın", 19 Ekim 2026). */
  note?: string;
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
    const slowTimer = setTimeout(() => setSlow(true), 45000);
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
      </div>
      {/* 19 Ekim 2026: nokta küresinin yerine markanın kendisi — sinyal ağda dolaşır, artıda parlar. */}
      <div className="apg-brand" aria-hidden>
        <CortexLogoMotion size={168} mode="loop" />
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
              {index === 0 && sourceChips.length ? (
                <span className="apg-chips">
                  {sourceChips.slice(0, 4).map((chip) => (
                    <span key={chip} className="apg-chip">
                      {chip}
                    </span>
                  ))}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
      {note ? (
        <p className="apg-slow" role="status">
          {note}
        </p>
      ) : null}
      {slow && !note ? (
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
