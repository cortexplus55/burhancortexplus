import type { QuizQuestion } from "@/lib/learning/exam-quiz";

/**
 * Test hazırlama süresi (madde 6). Ders adı yok: sıra, boşluk ve soru sayısı.
 * Akış, öğrencinin cevapladığı ilk soruların yerini sonradan kaydırmaz.
 */

export const PLAYABLE_PREFIX = 3;

export type QuizStageTiming = { draftMs: number; verifyMs: number; fixMs: number };

export function emptyQuizStages(): QuizStageTiming {
  return { draftMs: 0, verifyMs: 0, fixMs: 0 };
}

export function addQuizStages(left: QuizStageTiming, right: QuizStageTiming): QuizStageTiming {
  return {
    draftMs: left.draftMs + right.draftMs,
    verifyMs: left.verifyMs + right.verifyMs,
    fixMs: left.fixMs + right.fixMs,
  };
}

/** Yazım / denetim / onarım çağrılarının sürelerini role göre toplar. */
export async function timeQuizAsk<T>(
  stages: QuizStageTiming,
  role: "draft" | "verify" | "fix" | undefined,
  run: () => Promise<T>,
): Promise<T> {
  const started = Date.now();
  try {
    return await run();
  } finally {
    const ms = Date.now() - started;
    if (role === "verify") stages.verifyMs += ms;
    else if (role === "fix") stages.fixMs += ms;
    else stages.draftMs += ms;
  }
}

/**
 * İlk geçerli sorular. Çok cevaplı soru sonda durduğu için önek yalnız tek cevaplılardan kurulur.
 * Üçüncü sorunun önünde boş yer varsa sonra dolacak bir soru sırayı kaydırır; o zaman akış yok.
 * Kısa testte çok cevaplı soru öneğin içine girecekse akış yok.
 */
export function stablePlayableQuestions(
  slots: readonly (QuizQuestion | null)[],
  count: number,
): QuizQuestion[] | null {
  const want = Math.min(PLAYABLE_PREFIX, count);
  if (want < 1) return null;
  const rows: { index: number; question: QuizQuestion }[] = [];
  slots.forEach((question, index) => {
    if (question) rows.push({ index, question });
  });
  const singles = rows.filter((row) => !row.question.multi);
  const multi = rows.some((row) => row.question.multi);
  const holes = slots.flatMap((question, index) => (question == null ? [index] : []));
  if (singles.length < want) return null;
  if (multi && count - 1 < want) return null;
  const cutoff = singles[want - 1]!.index;
  if (holes.some((index) => index < cutoff)) return null;
  if (!multi && holes.length > 0 && count <= want) return null;
  const prefix = singles.slice(0, want).map((row) => row.question);
  const seen = new Set<string>();
  for (const question of prefix) {
    const key = question.text.trim().toLocaleLowerCase("tr-TR");
    if (!key || seen.has(key)) return null;
    seen.add(key);
  }
  return prefix;
}

/** Aynı kök ikinci kez öğrenciye gitmez. */
export function duplicateQuestionTexts(text: string, accepted: readonly string[]): boolean {
  const key = text.trim().toLocaleLowerCase("tr-TR");
  if (!key) return false;
  return accepted.some((item) => item.trim().toLocaleLowerCase("tr-TR") === key);
}

/**
 * "Beklenenden uzun sürüyor" testi, doğru/yanlış ve kartlarda çıkmaz.
 * Soru oynanabilir olduktan sonra da çıkmaz.
 */
export function slowPrepNotice(kind: string | null | undefined, playable = false): boolean {
  if (playable) return false;
  if (kind === "quiz" || kind === "true_false" || kind === "flashcards" || kind === "spaced") return false;
  return true;
}

export const BLOCK_PRACTICE_KINDS = ["quiz", "true_false", "flashcards"] as const;
export const BLOCK_PRACTICE_LIMIT = 3;

export type BlockPracticeNode = {
  id: string;
  kind: string;
  status: string | null;
  session_meta: unknown;
  sort_order?: number;
};

function metaId(meta: unknown, key: "topicId" | "lessonPart"): string | null {
  if (!meta || typeof meta !== "object") return null;
  const value = (meta as Record<string, unknown>)[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/**
 * Ders açılınca aynı bloğun testi, doğru/yanlış'ı ve kartları. Konu kimliği ve,
 * ikisi de doluysa, bölüm kimliği tutmalı. Bitmiş adım yazılmaz. En çok üç.
 */
export function blockPracticeTargets(
  lesson: { topicId?: string | null; lessonPart?: string | null },
  nodes: readonly BlockPracticeNode[],
): BlockPracticeNode[] {
  const topicId = lesson.topicId?.trim();
  if (!topicId) return [];
  const part = lesson.lessonPart?.trim() || null;
  return nodes
    .filter((node) => {
      if (!(BLOCK_PRACTICE_KINDS as readonly string[]).includes(node.kind)) return false;
      if (node.status === "done") return false;
      if (metaId(node.session_meta, "topicId") !== topicId) return false;
      const nodePart = metaId(node.session_meta, "lessonPart");
      if (part && nodePart && nodePart !== part) return false;
      return true;
    })
    .slice(0, BLOCK_PRACTICE_LIMIT);
}
