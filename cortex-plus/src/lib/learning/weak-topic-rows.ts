/**
 * /ilerleme "Eksik konular" satırları (6 Kasım 2026). `weak_topics.severity` her kaynakta aynı şeyi ölçmüyor:
 * testte ve denemede o konudaki soruların YANLIŞ oranı (0-1), sohbette sabit bir ağırlık (yüzde değil). Liste yalnız
 * "100%" yazıyordu; neyin yüzdesi olduğu belli değildi ve sohbet satırı uydurma bir oran gösteriyordu. Şimdi her satır
 * ne ölçtüğünü söyler; aynı konu bir kez (en yeni ölçüm) ve kaç kez eksik çıktığıyla görünür.
 */

import { withoutOutcomeCode } from "@/lib/learning/path-labels";

export type WeakTopicSource = "quiz" | "practice_exam" | "chat" | "other";

export type WeakTopicRow = {
  label: string;
  /** Son ölçümdeki yanlış oranı (0-100); oranı olmayan kaynakta (sohbet) null. */
  wrongPct: number | null;
  source: WeakTopicSource;
  /** Bu konunun listede kaç kez eksik çıktığı. */
  times: number;
  /** Satırın sağındaki açıklama: "Son testte yanlış oranı %40", "Sohbette eksik cevap". */
  note: string;
};

const SOURCE_PLACE: Record<Exclude<WeakTopicSource, "chat">, string> = {
  quiz: "Son testte",
  practice_exam: "Son denemede",
  other: "Son ölçümde",
};

function sourceOf(value: unknown): WeakTopicSource {
  if (value === "quiz" || value === "practice_exam" || value === "chat") return value;
  return "other";
}

/** Ham satırlar (en yeni önce) → konu başına tek satır, en yeni ölçümle. */
export function weakTopicRows(
  rows: readonly { topic_label?: unknown; severity?: unknown; source?: unknown }[],
  limit = 8,
): WeakTopicRow[] {
  const byKey = new Map<string, WeakTopicRow>();
  for (const row of rows) {
    const label = typeof row.topic_label === "string" ? row.topic_label.replace(/\s+/g, " ").trim() : "";
    if (!label) continue;
    const key = label.toLocaleLowerCase("tr");
    const seen = byKey.get(key);
    if (seen) {
      seen.times += 1;
      continue;
    }
    const source = sourceOf(row.source);
    const severity = Number(row.severity);
    const wrongPct =
      source === "chat" || !Number.isFinite(severity) ? null : Math.max(0, Math.min(100, Math.round(severity * 100)));
    const note =
      wrongPct != null && source !== "chat"
        ? `${SOURCE_PLACE[source]} yanlış oranı %${wrongPct}`
        : source === "chat"
          ? "Sohbette eksik ya da yanlış cevap"
          : "Eksik çıktı";
    // Kazanım kodu öğrenciye gösterilmez (11 Kasım 2026); eşleştirme anahtarı kodlu adla kalır.
    byKey.set(key, { label: withoutOutcomeCode(label), wrongPct, source, times: 1, note });
  }
  return [...byKey.values()].slice(0, limit);
}
