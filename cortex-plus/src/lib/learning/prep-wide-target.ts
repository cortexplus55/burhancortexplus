import type { PlanNodeKind } from "@/lib/learning/exam-prep-plan";
import {
  effectiveTarget,
  isMeasuredTopic,
  normalizeTopicKey,
  topicMasteryPercent,
  type TopicMasterySnapshot,
} from "@/lib/learning/learning-tracking";
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
  "flashcards",
]);

/**
 * Bütün konuları kapsayan adımlar (30 Ekim 2026, Paket I #8): son kontrol konu başına bir soru sorar
 * (25 Ekim P1-4), yazılı deneme ve "Hazırsın" hazırlığın tamamına bakar. Bunların konusu "Tüm konular";
 * yol kartı, oturum ve sonuç başlığı devraldıkları 1. konunun adını yazmaz. Önceden son kontrol 1. konu
 * etiketiyle açılıp başka konuları soruyordu.
 */
export const ALL_TOPICS_KINDS: ReadonlySet<PlanNodeKind> = new Set<PlanNodeKind>(["final_check", "written_exam", "readiness"]);
export const ALL_TOPICS_LABEL = "Tüm konular";

export type OpenMissRow = { topicLabel?: string | null };

export type FinalTopicRank = {
  label: string;
  /** Ölçülen başarı (`topicMasteryPercent`); ölçülmemişse null. */
  percent: number | null;
  measured: boolean;
  openWrongs: number;
};

/**
 * Final adımlarının konu sırası — TEK seçici (30 Ekim 2026, Paket I #8). "Zayıf nokta", odaklı pratik, son
 * tekrar kartları, son kontrolün sırası ve "Hazırsın" önerisi bunu okur; etiket, soru üretimi, sonuç başlığı
 * ve kanıt aynı konuyu söyler. Kural ders bağımsız ve yalnız sayılardan:
 *
 * 1. Ölçülen (en az 3 cevap) ve hedefin altındaki konular, en düşük başarı önce; eşitlikte açık yanlışı çok olan.
 * 2. Sonra ölçülmemiş ama açık yanlışı olan konular, en çok açık yanlış önce.
 * 3. Eşitlikte planın sırası.
 *
 * Ölçülmemiş ve açık yanlışı olmayan konu zayıf sayılmaz (önceden listeye "ölçülmedi" diye girip zayıf nokta
 * testine 5.-6. konunun sorularını getiriyordu).
 */
export function rankFinalStepTopics(input: {
  plannedTopics: readonly string[];
  mastery: readonly TopicMasterySnapshot[];
  openMisses: readonly OpenMissRow[];
  targetScore?: number | null;
}): FinalTopicRank[] {
  const target = effectiveTarget(input.targetScore);
  const seen = new Set<string>();
  const planned = input.plannedTopics
    .map((label) => label.trim())
    .filter((label) => {
      const key = normalizeTopicKey(label);
      if (!label || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const wrongs = new Map<string, number>();
  for (const row of input.openMisses) {
    const label = plannedLabelFor(row.topicLabel, planned);
    if (!label) continue;
    wrongs.set(label, (wrongs.get(label) ?? 0) + 1);
  }
  const byKey = new Map(input.mastery.map((topic) => [normalizeTopicKey(topic.topicKey), topic]));
  const rows = planned.map((label, index) => {
    const snapshot = byKey.get(normalizeTopicKey(label));
    const measured = isMeasuredTopic(snapshot);
    return {
      label,
      index,
      measured,
      percent: measured && snapshot ? topicMasteryPercent(snapshot) : null,
      openWrongs: wrongs.get(label) ?? 0,
    };
  });
  return rows
    .filter((row) => (row.measured && (row.percent ?? 0) < target) || row.openWrongs > 0)
    .sort((a, b) => {
      const tierA = a.measured && (a.percent ?? 0) < target ? 0 : 1;
      const tierB = b.measured && (b.percent ?? 0) < target ? 0 : 1;
      if (tierA !== tierB) return tierA - tierB;
      if (tierA === 0 && a.percent !== b.percent) return (a.percent ?? 0) - (b.percent ?? 0);
      if (a.openWrongs !== b.openWrongs) return b.openWrongs - a.openWrongs;
      return a.index - b.index;
    })
    .map(({ label, percent, measured, openWrongs }) => ({ label, percent, measured, openWrongs }));
}

/** En zayıf konu: `rankFinalStepTopics`'in ilki; zayıf konu yoksa null. */
export function finalStepTopic(input: Parameters<typeof rankFinalStepTopics>[0]): string | null {
  return rankFinalStepTopics(input)[0]?.label ?? null;
}

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

  // Son kartlar zayıf konu yokken de zor konudan (30 Ekim 2026, Paket I #8): en düşük ölçülen başarı önce,
  // eşitlikte en uzun süredir çalışılmayan. Önceden önce "en eski çalışılan" geliyordu; kartlar hedefin
  // üstündeki 2. haftanın konusundan çıkıyordu. Yüzde ham sayılardan (`topicMasteryPercent`), kayıtlı güvenden değil.
  const practicedAt = (topic: TopicMasterySnapshot) => {
    const time = topic.lastPracticedAt ? Date.parse(topic.lastPracticedAt) : Number.NaN;
    return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
  };
  const practiced = input.mastery
    .filter((topic) => topic.measured && topic.evidenceCount > 0)
    .map((topic) => ({ topic, label: plannedLabelFor(topic.topicKey, planned) }))
    .filter((row): row is { topic: TopicMasterySnapshot; label: string } => row.label !== null);
  const measured = practiced.filter((row) => isMeasuredTopic(row.topic));
  const pool = measured.length ? measured : practiced;
  const ordered = [...pool].sort(
    (a, b) =>
      topicMasteryPercent(a.topic) - topicMasteryPercent(b.topic) ||
      practicedAt(a.topic) - practicedAt(b.topic) ||
      planned.indexOf(a.label) - planned.indexOf(b.label),
  );
  return ordered[0]?.label ?? null;
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
