import type { Familiarity } from "@/lib/learning/session-signals";

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
  moodLead: "Öğretmen kendini nasıl hissettiğine göre uyum sağlayacak.",
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
