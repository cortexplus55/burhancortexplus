import { prepStars } from "@/lib/stars/rules";
import type { TopicMasteryState } from "@/lib/learning/learning-tracking";

/**
 * Sonuç sayfasının dört aşaması (29 Ekim 2026) — saf. Sayfa yalnız çizer; metin ve sayı burada.
 * Yıldız kuralı ödülle aynı fonksiyondan (`prepStars`), hâkimiyet artışı tamamlama kaydından,
 * eksikler açık yanılgı sayısı ve konu durumlarından. Okunamayan veri "okunamadı" diye yazılır,
 * sayfa düşmez.
 */
export type ResultStage = {
  id: "reward" | "mastery" | "gaps";
  icon: string;
  title: string;
  value: string;
  note?: string;
  /** Hâkimiyet aşamasında artış varsa (yeşil yazı). */
  gain?: boolean;
};

export type TopicGainRecord = { label: string; before: number; after: number };

export function readTopicGain(raw: unknown): TopicGainRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const before = Number(row.before);
  const after = Number(row.after);
  const label = typeof row.label === "string" ? row.label.trim() : "";
  if (!label || !Number.isFinite(before) || !Number.isFinite(after) || after <= before) return null;
  return { label, before, after };
}

/** Kanıt üreten türler: test, doğru/yanlış, sözlü, soru-cevap, odaklı pratik, son kontrol. */
const EVIDENCE_KINDS = new Set(["quiz", "true_false", "oral", "qa", "focused", "gaps", "final_check", "written_exam"]);

export function resultStages(input: {
  kind: string;
  score: number | null;
  total: number | null;
  streak: number | null;
  topicGain: unknown;
  openMisconceptions: number | null;
  masteryStates: TopicMasteryState[] | null;
}): ResultStage[] {
  const stars = prepStars(input.kind, input.score, input.total);
  const reward: ResultStage = {
    id: "reward",
    icon: "⭐",
    title: "Kazandığın yıldız ve seri",
    value: `+${stars} yıldız`,
    note:
      input.streak == null
        ? "Seri şu an okunamadı."
        : input.streak > 0
          ? `${input.streak} günlük seri sürüyor.`
          : "Bugün çalıştın; seri yarın da çalışınca başlar.",
  };

  const gain = readTopicGain(input.topicGain);
  const mastery: ResultStage = gain
    ? {
        id: "mastery",
        icon: "📈",
        title: "Konu hâkimiyeti",
        value: `+%${Math.max(1, Math.round(gain.after - gain.before))}`,
        note: `${gain.label} · şimdi %${Math.max(0, Math.min(100, Math.round(gain.after)))}`,
        gain: true,
      }
    : {
        id: "mastery",
        icon: "📈",
        title: "Konu hâkimiyeti",
        value: EVIDENCE_KINDS.has(input.kind) ? "Değişmedi" : "Bu adım ölçmez",
        note: EVIDENCE_KINDS.has(input.kind)
          ? "Hâkimiyet bu sonuçla artmadı; aynı konunun bir sonraki testi yeniden ölçer."
          : "Hâkimiyet testte, doğru/yanlışta ve sözlüde ölçülür.",
      };

  const needsWork = input.masteryStates?.filter((state) => state === "needs_work").length ?? null;
  const ready = input.masteryStates?.filter((state) => state === "ready").length ?? null;
  const parts: string[] = [];
  if (input.openMisconceptions != null) parts.push(`${input.openMisconceptions} açık yanılgı`);
  if (needsWork != null) parts.push(`${needsWork} çalışılacak konu`);
  if (ready != null) parts.push(`${ready} sağlam konu`);
  const gaps: ResultStage = {
    id: "gaps",
    icon: "🧩",
    title: "Kapanan ve kalan eksik",
    value: parts.length ? parts.join(" · ") : "Eksik sayısı şu an okunamadı",
    note:
      input.openMisconceptions === 0 && (needsWork ?? 0) === 0
        ? "Açık eksik yok; sıradaki adım pekiştirme."
        : input.openMisconceptions != null && input.openMisconceptions > 0
          ? "Yanılgı aynı konuda iki ayrı günde yardımsız doğru cevapla kapanır."
          : undefined,
  };

  return [reward, mastery, gaps];
}
