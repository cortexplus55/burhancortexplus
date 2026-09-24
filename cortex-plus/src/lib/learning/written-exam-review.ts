import { z } from "zod";
import {
  normalizeQuizQuestion,
  sameOptionSet,
  scoreQuizAnswers,
  selectedOptions,
  type QuizQuestion,
} from "@/lib/learning/exam-quiz";
import { normalizeTopicKey } from "@/lib/learning/learning-tracking";
import { unsupportedQuantities } from "@/lib/learning/teacher-brain";

export type WrittenReviewItem = {
  index: number;
  prompt: string;
  selected: string[];
  correct: string[];
  ok: boolean;
  /** Kayıtlı açıklama. Yoksa null — uydurulmaz. */
  explanation: string | null;
  topic: string;
};

export type WrittenTopicGroup = {
  topic: string;
  wrong: number;
  total: number;
  missedPrompts: string[];
};

export type WrittenExamReview = {
  score: number;
  total: number;
  items: WrittenReviewItem[];
  byTopic: WrittenTopicGroup[];
};

const fillSchema = z.object({
  explanations: z
    .array(
      z.object({
        index: z.number().int().min(0).max(20),
        text: z.string().min(8).max(400),
      }),
    )
    .max(12),
});

export function questionsFromQuizPayload(payload: unknown): QuizQuestion[] {
  const data = (payload ?? {}) as { questions?: unknown };
  if (!Array.isArray(data.questions)) return [];
  return data.questions
    .map((row) => (row && typeof row === "object" ? normalizeQuizQuestion(row as QuizQuestion) : null))
    .filter((question): question is QuizQuestion => question !== null);
}

/**
 * Konu adı yalnızca hazırlığın kendi listesinde varsa durur.
 * Model başka bir ad yazdıysa düğümün konusu kullanılır.
 */
export function topicForQuestion(
  question: QuizQuestion,
  knownTopics: string[],
  fallback: string,
): string {
  const raw = question.topic?.trim();
  const fallbackLabel = fallback.trim() || "Konu";
  if (!raw) return fallbackLabel;
  const hit = knownTopics.find(
    (topic) => normalizeTopicKey(topic) === normalizeTopicKey(raw),
  );
  return hit ?? fallbackLabel;
}

export function withCachedExplanations(
  questions: QuizQuestion[],
  cache: Record<string, string> | null | undefined,
): QuizQuestion[] {
  if (!cache) return questions;
  return questions.map((question, index) => {
    if (question.explanation?.trim()) return question;
    const filled = cache[String(index)]?.trim();
    return filled ? { ...question, explanation: filled } : question;
  });
}

function groundFor(question: QuizQuestion): string {
  return [question.text, question.explanation ?? "", ...question.options, ...question.correct].join(
    "\n",
  );
}

/** 3 ve üstü bir sayı soru, şık veya doğru cevapta yoksa açıklama yeni olgu taşır. */
function addsNovelNumber(text: string, source: string): boolean {
  const nums = text.match(/\d+(?:[.,]\d+)?/g) ?? [];
  for (const raw of nums) {
    const normalized = raw.replace(",", ".");
    const value = Number(normalized);
    if (!Number.isFinite(value) || value < 3) continue;
    const comma = normalized.replace(".", ",");
    if (!source.includes(raw) && !source.includes(normalized) && !source.includes(comma)) {
      return true;
    }
  }
  return false;
}

/** Kayıtlı soruda olmayan sayı veya formül açıklamaya girmez. */
export function acceptFilledExplanation(question: QuizQuestion, text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length < 8 || trimmed.length > 400) return null;
  const ground = groundFor(question);
  if (unsupportedQuantities(trimmed, ground).length) return null;
  if (addsNovelNumber(trimmed, ground)) return null;
  return trimmed;
}

/**
 * Tek çağrının çıktısı. Kabul edilmeyen satır düşer; yerine cümle yazılmaz.
 */
export function acceptFilledExplanations(
  questions: QuizQuestion[],
  raw: unknown,
): Record<string, string> {
  const parsed = fillSchema.safeParse(raw);
  if (!parsed.success) return {};
  const out: Record<string, string> = {};
  for (const row of parsed.data.explanations) {
    const question = questions[row.index];
    if (!question || question.explanation?.trim()) continue;
    const accepted = acceptFilledExplanation(question, row.text);
    if (accepted) out[String(row.index)] = accepted;
  }
  return out;
}

export function missingExplanationIndexes(questions: QuizQuestion[]): number[] {
  return questions
    .map((question, index) => (question.explanation?.trim() ? -1 : index))
    .filter((index) => index >= 0);
}

export function explanationFillPrompt(questions: QuizQuestion[], indexes: number[]): string {
  const lines = indexes
    .map((index) => {
      const question = questions[index];
      if (!question) return "";
      return [
        `#${index}`,
        question.text,
        `Şıklar: ${question.options.join(" | ")}`,
        `Doğru: ${question.correct.join(" | ")}`,
      ].join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
  return (
    "Bu soruların kayıtlı açıklaması yok. Her biri için 1-2 cümle yaz. " +
    "Yalnızca soru, şık ve doğru cevapta geçen olguyu kullan. Yeni sayı, formül veya konu ekleme. " +
    'JSON: {"explanations":[{"index":number,"text":string}]}\n\n' +
    lines
  );
}

export function buildWrittenExamReview(
  questions: QuizQuestion[],
  answers: Record<string, unknown>,
  input: { fallbackTopic: string; knownTopics?: string[] },
): WrittenExamReview {
  const known = input.knownTopics ?? [];
  const scored = scoreQuizAnswers(questions, answers);
  const items: WrittenReviewItem[] = questions.map((question, index) => {
    const selected = selectedOptions(answers[String(index)]);
    const ok = sameOptionSet(selected, question.correct);
    return {
      index,
      prompt: question.text,
      selected,
      correct: question.correct,
      ok,
      explanation: question.explanation?.trim() || null,
      topic: topicForQuestion(question, known, input.fallbackTopic),
    };
  });
  const groups = new Map<string, WrittenTopicGroup>();
  for (const item of items) {
    const group = groups.get(item.topic) ?? {
      topic: item.topic,
      wrong: 0,
      total: 0,
      missedPrompts: [],
    };
    group.total += 1;
    if (!item.ok) {
      group.wrong += 1;
      group.missedPrompts.push(item.prompt);
    }
    groups.set(item.topic, group);
  }
  return {
    score: scored.score,
    total: scored.total,
    items,
    byTopic: [...groups.values()].filter((group) => group.wrong > 0),
  };
}

export function readStoredReview(payload: unknown): WrittenExamReview | null {
  const row = (payload ?? {}) as { writtenReview?: unknown };
  const review = row.writtenReview;
  if (!review || typeof review !== "object") return null;
  const data = review as WrittenExamReview;
  if (!Array.isArray(data.items) || typeof data.score !== "number") return null;
  return data;
}

export function readExplanationCache(payload: unknown): Record<string, string> {
  const row = (payload ?? {}) as { explanationCache?: unknown };
  const cache = row.explanationCache;
  if (!cache || typeof cache !== "object" || Array.isArray(cache)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(cache as Record<string, unknown>)) {
    if (typeof value === "string" && value.trim()) out[key] = value.trim();
  }
  return out;
}

export function explanationFillAttempted(payload: unknown): boolean {
  return Boolean((payload as { explanationFillAttempted?: unknown } | null)?.explanationFillAttempted);
}
