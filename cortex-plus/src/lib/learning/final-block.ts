import type { PlanNodeKind } from "@/lib/learning/exam-prep-plan";
import type { QuizQuestion } from "@/lib/learning/exam-quiz";
import { nearDuplicate } from "@/lib/learning/item-dedup";
import { normalizeTopicKey } from "@/lib/learning/learning-tracking";

/**
 * Hazırlık sonu (25 Ekim 2026, canlı test P1-4). Hazırlık geneli adımlar devraldıkları 1. konunun adını
 * taşıyordu: son blok birinci konunun başlığıyla çıkıyor, son tekrar kartlarının 8'i tek konudan, son kontrol
 * yalnız zayıf konulardan 3 eski soru veriyordu. Bu dosya saf: yol bölümü, son kontrol seçimi, kart dağılımı.
 */
export const FINAL_SECTION_TITLE = "🏁 Sınav Finali ve Eksik Kapatma";

/** Konu bloğuna değil hazırlığın sonuna ait türler (uyarlamalı odaklı pratik hariç: o kendi konusunda). */
export const PREP_WIDE_SECTION_KINDS: ReadonlySet<PlanNodeKind> = new Set<PlanNodeKind>([
  "written_exam",
  "flashcards",
  "final_check",
  "gaps",
  "focused",
  "readiness",
]);

export function inFinalSection(
  kind: PlanNodeKind,
  sessionMeta?: { adaptive?: unknown; checkpoint?: unknown } | null,
): boolean {
  if (!PREP_WIDE_SECTION_KINDS.has(kind)) return false;
  // Ara sınav öncesi kontrol (28 Ekim 2026) yolun ortasında, sınavın gününden önce kalır.
  if (kind === "focused" && typeof sessionMeta?.checkpoint === "string") return false;
  return !(kind === "focused" && sessionMeta?.adaptive === "low");
}

export const FINAL_CHECK_LIMIT = 12;

/**
 * Son kontrol: konu başına bir soru, en çok 12. Konular zayıftan güçlüye sıralı gelir; 12'den fazlaysa ilk 12
 * konu birer hak alır. Öğrencinin daha önce cevapladığı kökle aynı bilgiyi soran madde alınmaz; havuzda
 * görülmemiş soru kalmadıysa konu `missingTopics`e düşer ve anında üretilir.
 */
export function finalCheckSelection(
  topics: readonly string[],
  pool: readonly QuizQuestion[],
  limit = FINAL_CHECK_LIMIT,
  seenStems: readonly string[] = [],
): { questions: QuizQuestion[]; missingTopics: string[] } {
  const seen = new Set<string>();
  const wanted = topics
    .map((topic) => topic.trim())
    .filter((topic) => {
      const key = normalizeTopicKey(topic);
      if (!topic || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, Math.max(1, limit));
  const byTopic = new Map<string, QuizQuestion[]>();
  for (const question of pool) {
    const key = normalizeTopicKey(question.topic);
    byTopic.set(key, [...(byTopic.get(key) ?? []), question]);
  }
  const picked = seenStems.map((stem) => stem.trim()).filter(Boolean);
  const questions: QuizQuestion[] = [];
  const missingTopics: string[] = [];
  for (const topic of wanted) {
    const fresh = (byTopic.get(normalizeTopicKey(topic)) ?? []).find(
      (question) => !picked.some((stem) => nearDuplicate(question.text, stem)),
    );
    if (fresh) {
      questions.push({ ...fresh, topic });
      picked.push(fresh.text);
    } else missingTopics.push(topic);
  }
  return { questions, missingTopics };
}

export type TopicStrength = { label: string; confidence: number | null };

/**
 * Son tekrar kartlarının konuları: zayıf (güven < 0,5) ve orta (0,5-0,8 ya da ölçülmemiş) konular, en zayıf önce;
 * güçlü konular yalnız başka konu yoksa. Kartlar bu konulara sırayla dağıtılır.
 */
export function finalCardTopics(topics: readonly TopicStrength[], max = 4): string[] {
  const usable = topics.filter((topic) => topic.label.trim());
  const asPercent = (confidence: number | null) =>
    confidence == null ? 65 : confidence <= 1 ? confidence * 100 : confidence;
  const rank = (topic: TopicStrength) => asPercent(topic.confidence);
  const notStrong = usable.filter((topic) => asPercent(topic.confidence) < 85);
  const list = (notStrong.length ? notStrong : usable)
    .map((topic, index) => ({ topic, index }))
    .sort((a, b) => rank(a.topic) - rank(b.topic) || a.index - b.index)
    .map((row) => row.topic.label.trim());
  return list.slice(0, Math.max(1, max));
}

/** `total` öğeyi konulara sırayla böler: 8 kart, 3 konu → 3, 3, 2. */
export function roundRobinCounts(topics: readonly string[], total: number): { label: string; count: number }[] {
  if (!topics.length || total <= 0) return [];
  const counts = topics.map((label) => ({ label, count: 0 }));
  for (let index = 0; index < total; index += 1) counts[index % counts.length]!.count += 1;
  return counts.filter((row) => row.count > 0);
}

/** Konu konu yazılan öğeleri sırayla birleştirir: aynı konudan art arda kart gelmez. */
export function interleaveByTopic<T>(groups: readonly T[][], total: number): T[] {
  const out: T[] = [];
  for (let round = 0; out.length < total; round += 1) {
    let added = false;
    for (const group of groups) {
      const item = group[round];
      if (item === undefined) continue;
      out.push(item);
      added = true;
      if (out.length >= total) break;
    }
    if (!added) break;
  }
  return out;
}
