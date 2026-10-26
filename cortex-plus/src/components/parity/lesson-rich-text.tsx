"use client";

import { studentTextParts } from "@/lib/learning/lesson-board";
import { studentSafeText } from "@/lib/learning/student-safe-text";
import { renderMath, splitMath } from "@/lib/learning/math-text";
import { normalizeMathIdentifiers, isProgrammingContext } from "@/lib/learning/math-identifiers";
import "@/styles/exam-lesson-steps.css";

/**
 * Öğrenciye giden metin: `$…$` matematiği KaTeX ile, **terim** vurgusu
 * kalın. Ders adımları bunu kullanıyordu; quiz ve flashcard aynı metni düz
 * yazı olarak basıyordu — derste dizilmiş görünen bir formül testte ham
 * `$\frac{a}{b}$` olarak kalırdı. Artık üçü de buradan geçiyor.
 */
export function RichBody({ text, topicHint = "" }: { text: string; topicHint?: string }) {
  const safe = studentSafeText(text);
  const normalized = normalizeMathIdentifiers(safe, {
    topicHint,
    programming: isProgrammingContext("", topicHint),
  });
  return (
    <>
      {splitMath(normalized).flatMap((segment, segIndex) => {
        if (segment.type === "math") {
          const Tag = segment.display ? "div" : "span";
          return (
            <Tag
              key={`m-${segIndex}`}
              className={segment.display ? "als-formula cp-lesson-math" : undefined}
              dangerouslySetInnerHTML={{
                __html: renderMath(segment.value, segment.display),
              }}
            />
          );
        }
        return studentTextParts(segment.value).map((part, index) =>
          part.exam ? (
            // Sınav vurgusu (18 Ekim 2026): sınavda soru olacak kesin bilgi, turuncu işaret.
            <mark key={`${segIndex}-${index}`} className="als-exam" title="Sınavda çıkar">
              {part.text}
            </mark>
          ) : part.bold ? (
            <strong key={`${segIndex}-${index}`} className="als-term">
              {part.text}
            </strong>
          ) : (
            <span key={`${segIndex}-${index}`}>{part.text}</span>
          ),
        );
      })}
    </>
  );
}
