import { dropNearDuplicates } from "@/lib/learning/item-dedup";
import type { QuizQuestion } from "@/lib/learning/exam-quiz";

/**
 * Testin öğrenciye açılma hedefi. Süre ölçülür; ders, sınav veya belge türüne göre değişmez.
 * Önceden yazılmış içerik ayrı, daha kısa bir hedef kullanır.
 */
export const QUIZ_PLAYABLE_TARGET_MS = 45_000;
export const QUIZ_PREFETCHED_TARGET_MS = 3_000;
/** İlk geçerli pencere: denetimden geçmiş ve tekrarı elenmiş sorular. */
export const QUIZ_STREAM_COUNT = 3;

const BLOCK_KINDS = new Set(["quiz", "true_false", "flashcards"]);
const QUIET_SLOW = new Set(["quiz", "true_false", "flashcards", "spaced"]);

export type PracticeNode = {
  id: string;
  kind: string;
  status?: string | null;
  sort_order?: number | null;
  session_meta?: unknown;
};

export type QuizStageMs = { draftMs: number; reviewMs: number; repairMs: number };

/** Düğümün konusu. Kimlik varsa kimlik, yoksa başlık. Başlık ders adı değildir, eşleşme anahtarıdır. */
export function practiceTopicKey(meta: unknown): string | null {
  if (!meta || typeof meta !== "object") return null;
  const row = meta as { topicId?: unknown; topicTitle?: unknown };
  if (typeof row.topicId === "string" && row.topicId.trim()) return `id:${row.topicId.trim()}`;
  if (typeof row.topicTitle === "string" && row.topicTitle.trim()) {
    return `title:${row.topicTitle.trim().toLocaleLowerCase("tr-TR")}`;
  }
  return null;
}

/**
 * Dersin ardından, sonraki derse kadar, aynı konunun testi, doğru/yanlış ve kartları.
 * Bitmiş adım yazılmaz. Yolun geri kalanı bu pencerenin dışındadır.
 */
export function blockPracticeNodes<T extends PracticeNode>(
  nodes: readonly T[],
  lessonSort: number,
  topicKey: string | null,
): T[] {
  if (!topicKey) return [];
  const ordered = [...nodes]
    .filter((node) => (node.sort_order ?? 0) > lessonSort)
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const out: T[] = [];
  for (const node of ordered) {
    if (node.kind === "lesson") break;
    if (practiceTopicKey(node.session_meta) !== topicKey) continue;
    if (node.status === "done" || node.status === "completed") continue;
    if (!BLOCK_KINDS.has(node.kind)) continue;
    out.push(node);
  }
  return out;
}

/** Denetimden geçmiş listenin tekrarları elenir, ilk pencere kesilir. */
export function playableQuestions(questions: readonly QuizQuestion[], previous: readonly string[] = []): QuizQuestion[] {
  const kept = dropNearDuplicates([...questions], (question) => question.text, [...previous]);
  return kept.slice(0, Math.min(QUIZ_STREAM_COUNT, kept.length));
}

/**
 * Akan listedeki cevaplanmış önek yerinde kalır. Gelen listedeki yeni kökler sona eklenir.
 * Aynı kökün şık sırası değişse de öğrencinin gördüğü soru değişmez.
 */
export function mergeStreamedQuestions<T extends { text?: string }>(shown: readonly T[], incoming: readonly T[]): T[] {
  if (!shown.length) return [...incoming];
  const seen = new Set(shown.map((question) => (question.text ?? "").trim()).filter(Boolean));
  const extra = incoming.filter((question) => {
    const text = (question.text ?? "").trim();
    return text && !seen.has(text);
  });
  return [...shown, ...extra];
}

/** Uzun uyarı yalnız ölçülmeyen beklemelerde. Test, kart ve tekrar kendi hedefiyle akar. */
export function showsSlowWarning(kind: string): boolean {
  return !QUIET_SLOW.has(kind);
}

export function quizOpenStagesLog(input: {
  topic: string;
  kind: string;
  stages: QuizStageMs;
  kept: number;
  streamed?: boolean;
  prefetched?: boolean;
}) {
  return {
    topic: input.topic.slice(0, 80),
    kind: input.kind,
    draftMs: input.stages.draftMs,
    reviewMs: input.stages.reviewMs,
    repairMs: input.stages.repairMs,
    kept: input.kept,
    streamed: Boolean(input.streamed),
    prefetched: Boolean(input.prefetched),
    playableTargetMs: QUIZ_PLAYABLE_TARGET_MS,
    prefetchedTargetMs: QUIZ_PREFETCHED_TARGET_MS,
  };
}

/** Takılı test: yazım bayrağı kalkar, eldeki sorular durur. Ders gibi kesik sayılmaz. */
export function settledQuizPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const next = { ...payload };
  delete next.building;
  delete next.builtAt;
  delete next.upcoming;
  return next;
}
