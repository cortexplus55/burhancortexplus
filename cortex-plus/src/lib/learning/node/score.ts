/** Bitişte puan ve Yanlışlar Defteri taslakları; sayım ekranla aynı işlevlerden (`answer-tally.ts`). */
import "server-only";
import { podcastCheckOf, scorePodcastCheck } from "@/lib/learning/podcast-check";
import type { PlanNodeKind } from "@/lib/learning/exam-prep-plan";
import { normalizeQuizQuestion, sameOptionSet, scoreQuizAnswers, selectedOptions, type QuizQuestion } from "@/lib/learning/exam-quiz";
import { activityTally, tallyScore } from "@/lib/learning/answer-tally";
import { scoreLessonChecks } from "@/lib/learning/lesson-claims";
import { readLessonV2 } from "@/lib/learning/lesson-v3";

export function scoreAttempt(
  kind: PlanNodeKind,
  payload: unknown,
  answers: Record<string, unknown>,
  teachingV2: boolean,
) {
  const data = (payload ?? {}) as Record<string, unknown>;
  if (data.type === "quiz") {
    const questions = ((data.questions as Parameters<typeof normalizeQuizQuestion>[0][]) ?? [])
      .map(normalizeQuizQuestion)
      .filter((question): question is QuizQuestion => question !== null);
    return { ...scoreQuizAnswers(questions, answers), retried: 0 };
  }
  // Doğru/yanlış sayımı ekranla aynı işlevden (30 Ekim 2026, Paket I #7, `answer-tally.ts`).
  if (data.type === "true_false") return { ...tallyScore(activityTally(data, answers)), retried: 0 };
  if (data.type === "cards") {
    const cards = (data.cards as unknown[]) ?? [];
    // Kart puanı oturum ekranıyla AYNI işlevden (30 Ekim 2026, `answer-tally.ts`): Bildim / kart. Liste çağıranın
    // verdiği gösterilen listedir (`cardsAsShown`).
    if (teachingV2 || data.masteryClaim === false) {
      return { ...tallyScore(activityTally(data, answers)), retried: 0 };
    }
    let score = 0;
    cards.forEach((_, index) => {
      if (answers[String(index)] === true || answers[String(index)] === "true") score += 1;
    });
    return { score, total: cards.length || 1, retried: 0 };
  }
  if (data.type === "oral") {
    const questions = (data.questions as unknown[]) ?? [];
    let score = 0;
    questions.forEach((_, index) => {
      if (String(answers[String(index)] ?? "").trim().length > 8) score += 1;
    });
    return { score, total: questions.length || 1, retried: 0 };
  }
  if (data.type === "lesson") {
    return scoreLessonChecks(readLessonV2(data.lesson) ?? { sections: [] }, answers);
  }
  // Dinleme kontrolü cevaplandıysa doğru / soru; kontrolsüz ya da "Şimdi değil" ise 1/1 (puansız).
  if (data.type === "podcast") return { ...scorePodcastCheck(data, answers), retried: 0 };
  return { score: 1, total: 1, retried: 0 };
}

export function lessonScoreForClient(
  payload: unknown,
  answers: Record<string, unknown>,
  fallbackScore: number,
  fallbackTotal: number,
) {
  const data = (payload ?? {}) as { type?: string; lesson?: { sections?: { check?: unknown }[] } };
  if (data.type === "lesson") return scoreLessonChecks(readLessonV2(data.lesson) ?? { sections: [] }, answers);
  return { score: fallbackScore, total: fallbackTotal, retried: 0 };
}

/** Exam-prep quiz/TF yanlışlarını mistake_entries şemasına çevirir. */
export function mistakeDraftsFromAttempt(
  attemptId: string,
  payload: unknown,
  answers: Record<string, unknown>,
  topicLabel: string | null,
) {
  const data = (payload ?? {}) as Record<string, unknown>;
  const drafts: {
    source: "quiz";
    sourceQuestionId: string;
    topicLabel: string | null;
    questionText: string;
    options: string[] | null;
    correctAnswer: string | null;
    wrongAnswer: string | null;
    explanation: string | null;
  }[] = [];

  if (data.type === "quiz") {
    const questions = ((data.questions as Parameters<typeof normalizeQuizQuestion>[0][]) ?? [])
      .map(normalizeQuizQuestion)
      .filter((question): question is QuizQuestion => question !== null);
    questions.forEach((question, index) => {
      const selected = selectedOptions(answers[String(index)]);
      if (!selected.length) return;
      if (sameOptionSet(selected, question.correct)) return;
      drafts.push({
        source: "quiz",
        sourceQuestionId: `${attemptId}:q:${index}`,
        topicLabel,
        questionText: question.text,
        options: question.options,
        correctAnswer: question.correct.join(" · ") || null,
        wrongAnswer: selected.join(" · ") || null,
        explanation: question.explanation ?? null,
      });
    });
  }

  // Dinleme kontrolünün yanlışı da deftere (20 Ekim 2026); atlanan soru (boş cevap) yanlış değil.
  if (data.type === "podcast") {
    podcastCheckOf(data).forEach((question, index) => {
      const selected = selectedOptions(answers[String(index)]);
      if (!selected.length || sameOptionSet(selected, question.correct)) return;
      drafts.push({
        source: "quiz",
        sourceQuestionId: `${attemptId}:pc:${index}`,
        topicLabel,
        questionText: question.text,
        options: question.options,
        correctAnswer: question.correct.join(" · ") || null,
        wrongAnswer: selected.join(" · ") || null,
        explanation: question.explanation ?? null,
      });
    });
  }

  if (data.type === "true_false") {
    const items =
      (data.items as { statement?: string; text?: string; correct: boolean; explanation?: string }[]) ??
      [];
    items.forEach((item, index) => {
      const value = answers[String(index)];
      if (value == null || value === "") return;
      const ok = value === item.correct || value === String(item.correct);
      if (ok) return;
      drafts.push({
        source: "quiz",
        sourceQuestionId: `${attemptId}:tf:${index}`,
        topicLabel,
        questionText: item.statement ?? item.text ?? `Doğru/Yanlış #${index + 1}`,
        options: ["Doğru", "Yanlış"],
        correctAnswer: item.correct ? "Doğru" : "Yanlış",
        wrongAnswer: String(value) === "true" || value === true ? "Doğru" : "Yanlış",
        explanation: item.explanation ?? null,
      });
    });
  }

  return drafts;
}

/**
 * Havuz konu testinin cevapları (3 Kasım 2026): `poolItemId` taşıyan soruların seçilen şıkkı ve doğruluğu.
 * Dizin `scoreAttempt` ile aynı (normalize edilmiş liste); boş cevap atlanır. Hakimiyet Haritası'na yazılır.
 */
export function poolQuizAnswers(
  payload: unknown,
  answers: Record<string, unknown>,
): { poolItemId: string; chosenText: string; correct: boolean }[] {
  const data = (payload ?? {}) as Record<string, unknown>;
  if (data.type !== "quiz" || !Array.isArray(data.questions)) return [];
  const out: { poolItemId: string; chosenText: string; correct: boolean }[] = [];
  let index = 0;
  for (const raw of data.questions as Parameters<typeof normalizeQuizQuestion>[0][]) {
    const question = normalizeQuizQuestion(raw);
    if (!question) continue;
    const at = index;
    index += 1;
    const poolItemId = (raw as { poolItemId?: unknown } | null)?.poolItemId;
    if (typeof poolItemId !== "string" || !poolItemId) continue;
    const selected = selectedOptions(answers[String(at)]);
    if (selected.length !== 1) continue;
    out.push({ poolItemId, chosenText: selected[0]!, correct: sameOptionSet(selected, question.correct) });
  }
  return out;
}

/** Havuz dışı konu testi soruları (3 Kasım 2026): yanıtlananların metni ve doğruluğu (Hakimiyet Haritası için). */
export function nonPoolQuizAnswers(
  payload: unknown,
  answers: Record<string, unknown>,
): { index: number; text: string; correct: boolean }[] {
  const data = (payload ?? {}) as Record<string, unknown>;
  if (data.type !== "quiz" || !Array.isArray(data.questions)) return [];
  const out: { index: number; text: string; correct: boolean }[] = [];
  let index = 0;
  for (const raw of data.questions as Parameters<typeof normalizeQuizQuestion>[0][]) {
    const question = normalizeQuizQuestion(raw);
    if (!question) continue;
    const at = index;
    index += 1;
    const poolItemId = (raw as { poolItemId?: unknown } | null)?.poolItemId;
    if (typeof poolItemId === "string" && poolItemId) continue;
    const selected = selectedOptions(answers[String(at)]);
    if (!selected.length) continue;
    out.push({ index: at, text: question.text, correct: sameOptionSet(selected, question.correct) });
  }
  return out;
}
