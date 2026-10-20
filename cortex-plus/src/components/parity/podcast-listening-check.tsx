"use client";

import { useState } from "react";
import { ExamQuizPlay } from "@/components/parity/exam-quiz-play";
import type { PublicQuizQuestion } from "@/lib/learning/exam-quiz";

/**
 * Podcast bitince dinleme kontrolü (20 Ekim 2026, kör kıyas: Astra'nın podcast'i sonda soru
 * soruyordu, bizimki bitip gidiyordu). Üç soru, testteki gibi anında geri bildirimle; cevaplar
 * tamamlamaya gider ve kanıt sayılır. "Şimdi değil" ilk seçimden önce durur: atlanınca podcast
 * bugünkü gibi puansız biter (ürün sahibinin kararı).
 */
export function PodcastListeningCheck({
  questions,
  busy = false,
  onDone,
  onSkip,
}: {
  questions: PublicQuizQuestion[];
  busy?: boolean;
  onDone: (answers: Record<string, string | string[]>) => void;
  onSkip: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  if (!questions.length) return null;
  const started = Object.keys(answers).length > 0;
  const last = index + 1 >= questions.length;

  return (
    <section className="cp-written-review cp-pod-check" aria-label="Dinleme kontrolü">
      <div className="cp-pod-check-head">
        <p className="cp-lesson-kicker">Dinleme kontrolü</p>
        {started ? null : (
          <button type="button" className="cp-pod-check-skip" disabled={busy} onClick={onSkip}>
            Şimdi değil
          </button>
        )}
      </div>
      {index === 0 && !started ? (
        <p className="cp-pod-check-lead">Az önce dinlediklerinden {questions.length} kısa soru.</p>
      ) : null}
      <ExamQuizPlay
        questions={questions}
        index={index}
        value={answers[String(index)]}
        onChange={(value) => setAnswers((current) => ({ ...current, [String(index)]: value }))}
        onContinue={() => {
          if (!last) setIndex(index + 1);
          else onDone(answers);
        }}
        continueLabel={last ? "Bitir" : "Sonraki soru"}
        disabled={busy}
      />
    </section>
  );
}
