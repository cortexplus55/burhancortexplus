import type { Familiarity } from "@/lib/learning/session-signals";
import { istanbulDay } from "@/lib/istanbul-day";

/**
 * Ders açılışının iki ekranı.
 *
 * Aşinalık ve ruh hali zaten soruluyor. Eksik olan, Astra ders
 * deneyiminde onların hemen ardından gelen kart: önce önerilen ders,
 * sonra "Ders oluştur". Slayt dersi bir sohbet değildir; metin bunu
 * "kısa bir ders" diye söyler.
 */
export const LESSON_OPEN_COPY = {
  familiarityTitle: "Bu konuya ne kadar aşinasın?",
  familiarityLead: "Bu, doğru zorluk seviyesini belirlememize yardımcı olur.",
  moodTitle: "Bugün ruh halin nasıl?",
  // Ruh hali yalnız kaydedilir (18 Ekim 2026): önceden yazılan ders ona göre değişemez.
  moodLead: "Cevabın çalışma geçmişine kaydedilir.",
  levelLabel: "Düzey",
  levelChange: "Değiştir",
  recommendedKicker: "ÖNERİLEN DERS",
  recommendedContinue: "Devam et",
  exploreTitle: "Konuyu öğretmeninle keşfet",
  exploreLead: "Bildiklerinin üzerine inşa etmek için kısa bir ders.",
  create: "Ders oluştur",
} as const;

/** Aşinalık kaydıracıyı başlatır. "İyi anlıyorum" sınav seviyesine zıplamaz. */
export function difficultyFromFamiliarity(
  level: Familiarity,
): "kolay" | "orta" | "ileri" {
  if (level === "new" || level === "heard") return "kolay";
  if (level === "confident") return "ileri";
  return "orta";
}

/** Ruh halinden sonra yalnızca giriş dersi öneri kartına uğrar. */
export function stepAfterMood(kind: string): "recommend" | "setup" {
  return kind === "lesson" ? "recommend" : "setup";
}

/**
 * Ruh hali günde bir kez sorulur (19 Ekim 2026, ürün sahibinin kararı): Astra'da hiç yok, bizde
 * her etkinlikten önce soruluyordu ve derste "ruh hali → önerilen ders" iki onay kartı art arda
 * çıkıyordu. Bugün (Türkiye günü) cevap verildiyse o kullanılır, kart atlanır.
 * Döner: bugünün Türkiye'de başladığı an (ISO), `created_at >=` sorgusu için.
 */
export function moodAskedSince(now: Date = new Date()): string {
  return new Date(`${istanbulDay(now)}T00:00:00+03:00`).toISOString();
}

/** Aşinalık biliniyorsa açılışın ilk ekranı: bugün ruh hali verildiyse doğrudan sonraki ekran. */
export function openingStage(
  kind: string,
  signals: { familiarityKnown: boolean; moodToday: boolean },
): "familiarity" | "mood" | "recommend" | "setup" {
  if (!signals.familiarityKnown) return "familiarity";
  return signals.moodToday ? stepAfterMood(kind) : "mood";
}
