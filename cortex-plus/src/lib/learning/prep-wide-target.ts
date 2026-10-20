import type { PlanNodeKind } from "@/lib/learning/exam-prep-plan";
import { normalizeTopicKey, type TopicMasterySnapshot } from "@/lib/learning/learning-tracking";
import { topicLabelsMatch } from "@/lib/learning/study-tools";

/**
 * Hazırlık geneli düğümler hangi konuyu çalıştırır (20 Ekim 2026).
 *
 * "Bilgi boşlukları", "Kartlarla son tekrar", odaklı pratik ve son kontrol yolun sonunda tek
 * düğüm; yol kurulurken yanındaki yazılı denemenin metasını devralıyorlar — o da hazırlığın İLK
 * konusu. Öğrenci Basınç'ta zorlanırken boşluk testi 1. konunun sayfalarından yazılıyordu, odaklı
 * pratiğin istemi "zayıf konular: Basınç" derken kaynağı 1. konuydu. Artık bu düğümler öğrencinin
 * en zayıf konusuna yönelir; istem, kaynak ve kanıt aynı konuyu söyler.
 *
 * Öğrenci konuyu kendisi seçtiyse (`?konu=`) ya da düğüm uyarlamalı odaklı pratikse (kendi konusu
 * var) dokunulmaz.
 */
export const PREP_WIDE_TARGET_KINDS: ReadonlySet<PlanNodeKind> = new Set<PlanNodeKind>([
  "gaps",
  "focused",
  "final_check",
  "flashcards",
]);

/**
 * `?konu=` ile gelen konu düğümün konusu değilse konunun kendi kaydı okunur (20 Ekim 2026). Yalnız
 * konunun sayfalarından yazan türler: önceden etiket istenen konuydu ama kaynak 1. konunun
 * kaydından çözülüyordu. Sözlü dışarıda: birden çok konu tek etikette gelebilir.
 */
export const REQUESTED_TOPIC_KINDS: ReadonlySet<PlanNodeKind> = new Set<PlanNodeKind>([
  "quiz",
  "true_false",
  "gaps",
  "focused",
  "final_check",
  "flashcards",
  "spaced",
  "podcast",
]);

function plannedLabelFor(raw: string | null | undefined, planned: readonly string[]): string | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  const key = normalizeTopicKey(text);
  return (
    planned.find((label) => normalizeTopicKey(label) === key) ??
    planned.find((label) => topicLabelsMatch(normalizeTopicKey(label), key)) ??
    null
  );
}

/** Saf seçim. Hedef planlı bir konunun adıdır; yoksa null (düğüm devraldığı konuda kalır). */
export function prepWideTargetTopic(input: {
  kind: PlanNodeKind;
  requestedTopic: string;
  adaptiveFocus: string | null;
  /** Zayıf konular, en zayıf önce (yerel oturumun ya da hafif okumanın listesi). */
  practiceTopics: readonly string[];
  mastery: readonly TopicMasterySnapshot[];
  plannedTopics: readonly string[];
}): string | null {
  if (input.requestedTopic.trim() || input.adaptiveFocus?.trim()) return null;
  if (!PREP_WIDE_TARGET_KINDS.has(input.kind)) return null;
  const planned = input.plannedTopics.map((label) => label.trim()).filter(Boolean);
  if (!planned.length) return null;

  const weakest =
    input.practiceTopics.map((topic) => plannedLabelFor(topic, planned)).find((label) => label !== null) ?? null;
  if (input.kind !== "flashcards") return weakest;
  if (weakest) return weakest;

  // Son kartlar: zayıf konu yoksa en uzun süredir çalışılmayan, o da yoksa en düşük güvenli konu.
  const measured = input.mastery
    .filter((topic) => topic.measured)
    .map((topic) => ({ topic, label: plannedLabelFor(topic.topicKey, planned) }))
    .filter((row): row is { topic: TopicMasterySnapshot; label: string } => row.label !== null);
  const dated = measured
    .filter((row) => row.topic.lastPracticedAt && Number.isFinite(Date.parse(row.topic.lastPracticedAt)))
    .sort((a, b) => Date.parse(a.topic.lastPracticedAt!) - Date.parse(b.topic.lastPracticedAt!));
  if (dated[0]) return dated[0].label;
  const lowest = [...measured].sort((a, b) => a.topic.confidence - b.topic.confidence)[0];
  return lowest?.label ?? null;
}

/**
 * İstenen konunun kaydı: önce birebir, sonra kayıt istenenin uzantısıysa ("Stokiyometri" →
 * "Stokiyometri: sınırlayıcı bileşen"). İstenen kaydın uzantısıysa eşleşmez ("A, B" isteği tek
 * "A" konusuna daraltılmaz).
 */
export function findTopicRow<T extends { label: string }>(rows: readonly T[], wanted: string): T | null {
  const key = normalizeTopicKey(wanted);
  if (!wanted.trim()) return null;
  const exact = rows.find((row) => normalizeTopicKey(row.label) === key);
  if (exact) return exact;
  return (
    rows.find((row) => {
      const rowKey = normalizeTopicKey(row.label);
      return rowKey.length > key.length && topicLabelsMatch(key, rowKey);
    }) ?? null
  );
}
