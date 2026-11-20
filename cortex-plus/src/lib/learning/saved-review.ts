import { replayLessonPayload } from "@/lib/learning/lesson-replay";
import { normalizeQuizQuestion, type QuizQuestion } from "@/lib/learning/exam-quiz";
import { shuffleOptions } from "@/lib/learning/teacher-quiz";
import { seededOrder } from "@/lib/learning/seeded-order";

export { seededOrder } from "@/lib/learning/seeded-order";

/**
 * Bitmiş adımın kayıtlı gövdesi (25 Ekim 2026). Yeni üretim ve kredi yok: ders
 * "Dersi tekrarla" ile aynı kayıttan açılır; test, kart, podcast ve sözlü
 * son kaydın gövdesini taşır. Yazımı süren ders (`building`) açılmaz.
 *
 * Faz 4 (19 Kasım 2026, %100 ücretsiz yeniden çalışma): test (yazılı deneme dahil) ve doğru/yanlış tekrarında soru
 * sırası ve şık sırası `salt`a (yeni denemenin kimliği) bağlı kararlı biçimde karışır; doğru cevap şık metni olarak
 * taşındığından anahtar korunur. Önceki denemeye ait alanlar (kazanç kartı, puanlama, iade) yeni denemeye geçmez.
 */
export function savedReviewPayload(payload: unknown, salt: string): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  if (row.building === true) return null;
  if (row.type === "lesson") return replayLessonPayload(payload, salt);
  if (typeof row.type !== "string" || !row.type) return null;
  const lists = ["questions", "items", "cards", "chapters"] as const;
  const hasList = lists.some((key) => Array.isArray(row[key]) && (row[key] as unknown[]).length > 0);
  if (!hasList) return null;
  const rest = { ...row };
  delete rest.building;
  delete rest.builtAt;
  delete rest.upcoming;
  delete rest.adoptedPrefetch;
  delete rest.prefetchVariant;
  delete rest.topicGain;
  delete rest.studentRating;
  delete rest.refunded;
  // Yazılı denemenin önceki karnesi yeni çözüme taşınmaz; doldurulmuş açıklamalar soruya gömülür (sıra karışınca
  // sıra numaralı önbellek kayardı) ve dolum bir daha istenmez (yeniden çözümde model çağrısı yok).
  delete rest.writtenReview;
  if (rest.type === "quiz" && Array.isArray(rest.questions)) {
    const cache = explanationCacheOf(rest.explanationCache);
    const filled = (rest.questions as unknown[]).map((question, index) => withCachedExplanation(question, cache[String(index)]));
    rest.explanationFillAttempted = true;
    delete rest.explanationCache;
    rest.questions = seededOrder(filled, `${salt}:questions`).map((question) => reshuffledQuestion(question, salt));
  }
  if (rest.type === "true_false" && Array.isArray(rest.items)) {
    rest.items = seededOrder(rest.items as unknown[], `${salt}:items`);
  }
  return { ...rest, reviewed: true };
}

function explanationCacheOf(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, text] of Object.entries(value as Record<string, unknown>)) {
    if (typeof text === "string" && text.trim()) out[key] = text.trim();
  }
  return out;
}

function withCachedExplanation(question: unknown, cached: string | undefined): unknown {
  if (!cached || !question || typeof question !== "object") return question;
  const row = question as { explanation?: unknown };
  if (typeof row.explanation === "string" && row.explanation.trim()) return question;
  return { ...(question as object), explanation: cached };
}

const CHOICE_PREFIX = /^[A-Ea-e][).:\-]\s/;

/**
 * Şıkları tuzla karıştırır. Doğru cevap önce şık metnine çözülür (eski kayıtta harf ya da sıra olabilir); şıklar
 * harf önekli yazılmışsa ya da anahtar çözülemiyorsa soru olduğu gibi kalır (anahtar asla kaymaz).
 */
function reshuffledQuestion(raw: unknown, salt: string): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const question = raw as Record<string, unknown>;
  const options = Array.isArray(question.options) ? (question.options as unknown[]) : null;
  if (!options || options.length < 2 || options.some((option) => typeof option !== "string")) return raw;
  const texts = options as string[];
  if (texts.some((option) => CHOICE_PREFIX.test(option.trim()))) return raw;
  const normalized = normalizeQuizQuestion(question as Parameters<typeof normalizeQuizQuestion>[0]);
  if (!normalized) return raw;
  const sameOptions =
    normalized.options.length === texts.length && normalized.options.every((option, index) => option === texts[index].trim());
  if (!sameOptions || !normalized.correct.length) return raw;
  const shuffled = shuffleOptions({ ...(question as unknown as QuizQuestion), options: normalized.options, correct: normalized.correct }, salt);
  return shuffled;
}
