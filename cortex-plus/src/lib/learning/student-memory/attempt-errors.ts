/**
 * Tamamlanmış etkinlik kaydından yanlış cevaplar (5 Kasım 2026) — SAF.
 *
 * Test ve doğru/yanlış kayıtlarını `extractMisconceptions` ile aynı cevap/şık eşlemesiyle okur
 * (`selectedOptions`, `sameOptionSet`); boş cevap sayılmaz, hatalı bulunan soru (`voided`) atlanır.
 * Her yanlış `classifyWrongAnswer` ile türlenir.
 */
import { sameOptionSet, selectedOptions, type QuizQuestion } from "@/lib/learning/exam-quiz";
import { classifyWrongAnswer, type ErrorKind } from "./error-kinds";

export type AttemptErrorScan = {
  /** Cevaplanan soru sayısı (doğru + yanlış). */
  answered: number;
  wrong: { kind: ErrorKind; at: string | null }[];
};

type TrueFalseItem = { text?: unknown; correct?: unknown };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function scanQuiz(questions: unknown, answers: Record<string, unknown>, at: string | null): AttemptErrorScan {
  const out: AttemptErrorScan = { answered: 0, wrong: [] };
  if (!Array.isArray(questions)) return out;
  (questions as (QuizQuestion & { voided?: boolean })[]).forEach((question, index) => {
    if (!question || question.voided) return;
    const chosen = selectedOptions(answers[String(index)]).filter((item) => item.trim());
    if (!chosen.length) return;
    out.answered += 1;
    const correct = Array.isArray(question.correct) ? question.correct.map(String) : [];
    if (sameOptionSet(chosen, correct)) return;
    out.wrong.push({
      kind: classifyWrongAnswer({
        stem: String(question.text ?? ""),
        options: Array.isArray(question.options) ? question.options.map(String) : [],
        correct,
        chosen,
        multi: question.multi === true,
        timeMs: null,
      }),
      at,
    });
  });
  return out;
}

function scanTrueFalse(items: unknown, answers: Record<string, unknown>, at: string | null): AttemptErrorScan {
  const out: AttemptErrorScan = { answered: 0, wrong: [] };
  if (!Array.isArray(items)) return out;
  (items as TrueFalseItem[]).forEach((item, index) => {
    if (!item || typeof item.correct !== "boolean") return;
    const value = answers[String(index)];
    if (value == null || String(value).trim() === "") return;
    out.answered += 1;
    if (value === item.correct || value === String(item.correct)) return;
    out.wrong.push({
      kind: classifyWrongAnswer({
        stem: String(item.text ?? ""),
        options: ["true", "false"],
        correct: [String(item.correct)],
        chosen: [String(value)],
        multi: false,
        timeMs: null,
      }),
      at,
    });
  });
  return out;
}

/** Kaydın türüne göre tarama; test ve doğru/yanlış dışındaki kayıtlar boş döner. */
export function scanAttemptErrors(payload: unknown, answers: unknown, at: string | null): AttemptErrorScan {
  const data = asRecord(payload);
  const answerMap = asRecord(answers);
  if (data.type === "quiz") return scanQuiz(data.questions, answerMap, at);
  if (data.type === "true_false") return scanTrueFalse(data.items, answerMap, at);
  return { answered: 0, wrong: [] };
}
