import { z } from "zod";
import {
  normalizeQuizQuestion,
  quizQuestionSchema,
  type QuizQuestion,
} from "@/lib/learning/exam-quiz";
import { acceptFilledExplanation } from "@/lib/learning/written-exam-review";

/**
 * Zor soru seti. Uygulama sorusu, kaynağın dışına çıkmaz.
 * Açıklama, yazılı denemedeki açıklamayla aynı denetimden geçer.
 */

const looseSchema = z.object({
  questions: z.array(quizQuestionSchema).min(1).max(8),
});

export const CHALLENGE_SOURCE_CAP = 8000;

export function buildChallengeSource(
  pages: { documentId?: string; pageNumber: number; text: string }[],
): string {
  const chunks: string[] = [];
  let used = 0;
  const ordered = [...pages].sort((a, b) => a.pageNumber - b.pageNumber);
  for (const page of ordered) {
    const text = page.text.replace(/\s+/g, " ").trim();
    if (!text) continue;
    const room = CHALLENGE_SOURCE_CAP - used;
    if (room <= 0) break;
    const slice = text.slice(0, room);
    chunks.push(slice);
    used += slice.length + 1;
  }
  return chunks.join("\n");
}

function numbersOf(text: string): string[] {
  return text.match(/\d+(?:[.,]\d+)?/g) ?? [];
}

/** 3 ve üstü bir sayı kaynakta yoksa soru uydurma sayılır. */
export function sourceHasQuantities(text: string, source: string): boolean {
  for (const raw of numbersOf(text)) {
    const normalized = raw.replace(",", ".");
    const value = Number(normalized);
    if (!Number.isFinite(value) || value < 3) continue;
    const comma = normalized.replace(".", ",");
    if (!source.includes(raw) && !source.includes(normalized) && !source.includes(comma)) {
      return false;
    }
  }
  return true;
}

export function acceptChallengeQuestion(
  question: QuizQuestion,
  source: string,
): QuizQuestion | null {
  const explanation = question.explanation?.trim() ?? "";
  if (!explanation) return null;
  const accepted = acceptFilledExplanation(question, explanation, source);
  if (!accepted) return null;
  const stem = [question.text, ...question.options, ...question.correct, accepted].join("\n");
  if (!sourceHasQuantities(stem, source)) return null;
  if (!sourceHasQuantities(accepted, source)) return null;
  return { ...question, explanation: accepted };
}

/** Kabul edilmeyen soru düşer. Yerine cümle yazılmaz. */
export function acceptChallengeSet(raw: unknown, source: string): QuizQuestion[] {
  const parsed = looseSchema.safeParse(raw);
  if (!parsed.success || !source.trim()) return [];
  const questions: QuizQuestion[] = [];
  for (const row of parsed.data.questions) {
    const question = normalizeQuizQuestion(row);
    if (!question) continue;
    const accepted = acceptChallengeQuestion(question, source);
    if (accepted) questions.push(accepted);
  }
  return questions;
}

export function challengePrompt(input: {
  title: string;
  topics: string[];
  source: string;
}): string {
  const topics = input.topics.filter(Boolean).join(", ") || input.title;
  return [
    `Sınav: ${input.title}.`,
    `Konular: ${topics}.`,
    "Bu metinden 4 zor uygulama sorusu yaz. Tanım tekrarı yazma.",
    "Zorluk: iki olguyu birlikte kullansın ya da koşulu değiştirip sonucu sordursun.",
    "Yalnızca KAYNAK içindeki olguyu kullan. Kaynakta olmayan sayı, formül, birim ya da kavram ekleme.",
    "Her soru çoktan seçmeli olsun. Doğru şık options içinde yazılsın.",
    "explanation 1-2 cümle olsun ve yalnızca kaynakta geçen olguyu söylesin.",
    'JSON: {"questions":[{"text":string,"options":string[],"correct":string,"multi":false,"explanation":string,"topic":string}]}',
    "",
    "KAYNAK:",
    input.source,
  ].join("\n");
}
