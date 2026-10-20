import { istanbulDay } from "@/lib/istanbul-day";
import { normalizeTopicKey } from "@/lib/learning/learning-tracking";
import { topicLabelsMatch } from "@/lib/learning/study-tools";

/**
 * Yanılgı ne zaman çözülmüş sayılır (20 Ekim 2026).
 *
 * `exam_prep_misconceptions` satırı yazılıyor ama hiç kapanmıyordu: bir kez yanlış yapan öğrencinin
 * "açık yanlış" sayısı sonsuza kadar duruyor, "Hazırsın" hiç gelmiyor, Bilgi boşlukları aynı yanlışı
 * yeniden soruyordu. Kural: aynı konu, yanılgıdan SONRA, iki ayrı Türkiye gününde, yardımsız doğru
 * cevaplanınca yanılgı çözülür. Tek günde iki doğru yetmez — ezber değil, kalıcılık aranıyor.
 *
 * Eşleşme konu anahtarıyla. Öğretmenin `misconceptionTag`'i soru başına serbest metin ve kanıt
 * satırı etiketi yalnız yanlış cevapta tutuyor; sonraki doğru cevapta etiket yok, bağ kurulamaz.
 *
 * Hiçbir planlı konuya bağlanmayan yanılgı (sohbetteki iddia: konu etiketi boş, "genel" ya da
 * serbest metin) hazırlığın herhangi bir konusundaki iki ayrı günün doğru cevabıyla çözülür (ürün
 * sahibinin kararı) — yoksa hazırlığı sonsuza kadar kapalı tutardı.
 *
 * Kartın öz-değerlendirmesi kanıt değildir, burada yoktur: yalnız ölçülen cevap çözer.
 */
export const RESOLVE_DISTINCT_DAYS = 2;

export type OpenMisconceptionRow = {
  id: string;
  topicLabel: string | null;
  attemptId: string | null;
  createdAt: string;
};

/** Doğru ve yardımsız kanıt satırı — süzme çağıranda (`correct`, `hint_assisted = false`). */
export type ResolvingEvidenceRow = {
  topicKey: string | null;
  attemptId: string | null;
  createdAt: string;
};

/** "Stokiyometri" = "stokiyometri: sınırlayıcı bileşen"; iki yan da aynı anahtarla katlanır. */
export function sameTopicKey(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = normalizeTopicKey(left);
  const b = normalizeTopicKey(right);
  return a === b || topicLabelsMatch(a, b);
}

function orphanRow(label: string | null, planned: readonly string[]): boolean {
  const text = (label ?? "").trim();
  if (!text || normalizeTopicKey(text) === "genel") return true;
  return !planned.some((key) => sameTopicKey(key, text));
}

/** Çözülecek yanılgıların kimlikleri. Saf: sorgu ve yazım çağıranda. */
export function misconceptionsToResolve(input: {
  open: readonly OpenMisconceptionRow[];
  evidence: readonly ResolvingEvidenceRow[];
  plannedTopicKeys: readonly string[];
}): string[] {
  const out: string[] = [];
  for (const row of input.open) {
    const missedAt = Date.parse(row.createdAt);
    if (!Number.isFinite(missedAt)) continue;
    const anyTopic = orphanRow(row.topicLabel, input.plannedTopicKeys);
    const days = new Set<string>();
    for (const evidence of input.evidence) {
      // Yanılgıyı yazan denemenin kendi doğruları sayılmaz.
      if (row.attemptId && evidence.attemptId === row.attemptId) continue;
      const at = Date.parse(evidence.createdAt);
      if (!Number.isFinite(at) || at <= missedAt) continue;
      if (!anyTopic && !sameTopicKey(evidence.topicKey, row.topicLabel)) continue;
      // Gün sunucunun saatinden değil Türkiye'den (UTC'de 23:30 ile 00:30 aynı gün olabilir).
      days.add(istanbulDay(new Date(at)));
    }
    if (days.size >= RESOLVE_DISTINCT_DAYS) out.push(row.id);
  }
  return out;
}
