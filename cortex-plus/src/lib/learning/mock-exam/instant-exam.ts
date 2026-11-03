/**
 * Anında deneme açılışı (3 Kasım 2026): havuz POST yanıtındaki sorular istemci belleğinde tutulur; sınav
 * sayfasının loading sınırı bunları okuyup ilk soruyu sunucu çizimi gelmeden gösterir. Doğru cevap içermez.
 * Yalnız uygulamada çözüm (kâğıt modu sayfayı bekler). Süre sınırı: 2 dk; sonra normal yol.
 */
import type { RunnerQuestion } from "@/components/parity/exam-runner";

const MAX_AGE_MS = 120_000;

export type InstantExam = { examId: string; prepId: string; title: string; questions: RunnerQuestion[]; at: number };

let current: InstantExam | null = null;

function valid(questions: unknown): questions is RunnerQuestion[] {
  return (
    Array.isArray(questions) &&
    questions.length > 0 &&
    questions.every(
      (q) =>
        q &&
        typeof q === "object" &&
        typeof (q as RunnerQuestion).id === "string" &&
        typeof (q as RunnerQuestion).text === "string" &&
        Array.isArray((q as RunnerQuestion).options),
    )
  );
}

export function primeInstantExam(input: { examId: string; prepId: string; title: unknown; questions: unknown }, now = Date.now()): boolean {
  if (!valid(input.questions)) return false;
  current = {
    examId: input.examId,
    prepId: input.prepId,
    title: typeof input.title === "string" && input.title ? input.title : "Deneme",
    questions: input.questions,
    at: now,
  };
  return true;
}

/** Bu adres için taze kayıt (silmez: loading birden çok kez çizilebilir). */
export function peekInstantExam(prepId: string, examId: string, now = Date.now()): InstantExam | null {
  if (!current || current.examId !== examId || current.prepId !== prepId) return null;
  if (now - current.at > MAX_AGE_MS) {
    current = null;
    return null;
  }
  return current;
}

export function clearInstantExam(): void {
  current = null;
}
