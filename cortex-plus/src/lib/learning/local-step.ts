import { normalizeQuizQuestion, scoreQuizAnswers } from "@/lib/learning/exam-quiz";

/**
 * Test ve doğru/yanlış puanı, sunucudaki `scoreAttempt` ile aynı kural.
 * Sonuç ekranı bu puanla hemen açılır; sunucu teyidi arkadan gelir.
 */

type LocalPayload = {
  type?: string;
  questions?: unknown;
  items?: unknown;
};

export function localStepScore(
  payload: LocalPayload,
  answers: Record<string, unknown>,
): { score: number; total: number } | null {
  if (payload.type === "quiz") {
    const questions = (Array.isArray(payload.questions) ? payload.questions : [])
      .map((question) => {
        if (!question || typeof question !== "object") return null;
        const row = question as { text?: unknown; options?: unknown; correct?: unknown; multi?: unknown };
        if (typeof row.text !== "string" || !Array.isArray(row.options)) return null;
        return normalizeQuizQuestion({
          text: row.text,
          options: row.options.filter((option): option is string => typeof option === "string"),
          correct: row.correct as string | number | (string | number)[],
          multi: row.multi === true,
        });
      })
      .filter((question): question is NonNullable<typeof question> => question !== null);
    if (!questions.length) return null;
    return scoreQuizAnswers(questions, answers);
  }
  if (payload.type === "true_false") {
    const items = (Array.isArray(payload.items) ? payload.items : []) as { correct?: unknown }[];
    if (!items.length) return null;
    let score = 0;
    items.forEach((item, index) => {
      const value = answers[String(index)];
      if (value === item.correct || value === String(item.correct)) score += 1;
    });
    return { score, total: items.length };
  }
  return null;
}
