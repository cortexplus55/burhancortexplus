"use client";

import { Check } from "lucide-react";
import { MathText } from "@/components/learning/math-text";
import type { QuickCheck, QuickCheckOption } from "@/lib/teacher/quick-check";
import "@/styles/teacher-v2-sohbet.css";

/**
 * Canlı kara tahta (Faz 11, teacher.v2): öğretmenin mini yoklaması ("> ❓ Yoklama:") şıklı kart olarak çizilir. Şıkka
 * dokunmak seçimi öğrencinin mesajı olarak gönderir; doğru şık bu kartta yok (öğretmen cevaba göre konuşur). Yalnız son
 * yanıtın kartı etkileşimli; seçimden sonra kart kilitlenir ve seçilen şık işaretli kalır (sonraki öğrenci mesajından).
 */
export function TeacherQuickCheck({
  check,
  interactive,
  chosen,
  onAnswer,
}: {
  check: QuickCheck;
  interactive: boolean;
  /** Seçilen şıkkın harfi (yoksa null). */
  chosen: string | null;
  onAnswer?: (option: QuickCheckOption) => void;
}) {
  const locked = !interactive || chosen != null;
  return (
    <section className="cx-v2-check" aria-label="Mini yoklama" data-locked={locked || undefined}>
      <p className="cx-v2-check-kicker">
        <span aria-hidden>❓</span> Yoklama
      </p>
      <div className="cx-v2-check-q">
        <MathText text={check.question} />
      </div>
      <div className="cx-v2-check-options" role="group" aria-label={check.question}>
        {check.options.map((option) => {
          const selected = chosen === option.letter;
          return (
            <button
              key={option.letter}
              type="button"
              className="cx-v2-option"
              data-cx-option={selected ? "selected" : "idle"}
              aria-pressed={selected}
              disabled={locked}
              onClick={() => onAnswer?.(option)}
            >
              <span className="cx-v2-option-letter" data-cx-letter aria-hidden>
                {selected ? <Check aria-hidden /> : option.letter}
              </span>
              <span className="cx-v2-option-text">
                <span className="sr-only">{option.letter}) </span>
                <MathText text={option.text} />
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
