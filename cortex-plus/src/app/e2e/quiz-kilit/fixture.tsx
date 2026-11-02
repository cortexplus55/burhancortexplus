"use client";

/** Test cevap kilidi fikstürü: kilit ve cevap sessionStorage'da (sunucu kaydının yerine); yenileme kilidi korur. */
import { useEffect, useState } from "react";
import { ExamQuizPlay } from "@/components/parity/exam-quiz-play";
import { applyAnswerLocks, lockedKeys, ANSWER_LOCK_KEY } from "@/lib/learning/answer-lock";

const KEY = "e2e:quiz-kilit";
const QUESTIONS = [
  { text: "Örnek soru 1: hangisi doğru?", options: ["Birinci", "İkinci", "Üçüncü", "Dördüncü"], multi: false, correct: ["İkinci"], explanation: "Doğru cevap ikinci seçenek." },
  { text: "Örnek soru 2: hangisi doğru?", options: ["Bir", "İki", "Üç", "Dört"], multi: false, correct: ["Üç"], explanation: "Doğru cevap üçüncü seçenek." },
];

export function QuizLockFixture() {
  const [answers, setAnswers] = useState<Record<string, unknown> | null>(null);
  useEffect(() => {
    setAnswers(JSON.parse(sessionStorage.getItem(KEY) ?? "{}") as Record<string, unknown>);
  }, []);
  if (!answers) return null;
  const save = (next: Record<string, unknown>) => {
    const saved = JSON.parse(sessionStorage.getItem(KEY) ?? "{}") as Record<string, unknown>;
    const locked = applyAnswerLocks(saved, next);
    sessionStorage.setItem(KEY, JSON.stringify(locked));
    setAnswers(locked);
  };
  return (
    <main className="p-4">
      <ExamQuizPlay
        questions={QUESTIONS}
        index={0}
        value={answers["0"]}
        onChange={(value) => save({ ...answers, "0": value })}
        onReveal={() => save({ ...answers, [ANSWER_LOCK_KEY]: [...lockedKeys(answers), "0"] })}
        locked={lockedKeys(answers).includes("0")}
        onContinue={() => undefined}
        continueLabel="Sonraki soru"
      />
    </main>
  );
}
