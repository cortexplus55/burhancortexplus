import type { ActionCode } from "@/lib/env";
import { CREDIT_PRICE_TABLE } from "@/lib/credits/price-table";
import { FREE_DAILY_ALLOWANCE } from "@/lib/credits/period";

/**
 * Ücretsiz günlük hakkın yetmediği işler (19 Ekim 2026).
 *
 * Ücretsiz hesap günde 6 kredi alır; podcast 12, sözlü 8, yazılı deneme 15, fotoğraf çözümü 10, video
 * 280 kredi. Bu işler ücretsiz hakla hiçbir gün açılmaz. Önceden öğrenci podcast'i kurup "oluştur"a
 * basınca "Bu ders için kullanım hakkın doldu" ve yenilenme geri sayımı görüyordu — hakkını hiç
 * kullanmamış olsa da, ve beklemek hiçbir şeyi değiştirmiyordu.
 *
 * Eşleme düğüm rotasındaki `actionForKind` ile aynı (bekçi test karşılaştırır).
 */
export const NODE_KIND_ACTION: Record<string, ActionCode> = {
  lesson: "STUDY_PLAN_GENERATE",
  podcast: "PODCAST_GENERATE",
  oral: "ORAL_EXAM_GENERATE",
  flashcards: "FLASHCARD_GENERATE",
  spaced: "FLASHCARD_GENERATE",
};

export function actionForNodeKind(kind: string): ActionCode {
  return NODE_KIND_ACTION[kind] ?? "QUIZ_GENERATE";
}

export function exceedsFreeDaily(code: ActionCode): boolean {
  return CREDIT_PRICE_TABLE[code].credits > FREE_DAILY_ALLOWANCE;
}

/** Araç seçicideki karolar: yazılı deneme ayrı rotadan (deneme ücreti), video yalnız Plus. */
const TOOL_ACTION: Record<string, ActionCode> = {
  podcast: "PODCAST_GENERATE",
  oral: "ORAL_EXAM_GENERATE",
  written_exam: "PRACTICE_EXAM_GENERATE",
  video: "VIDEO_GENERATE",
};

/** Ücretsiz öğrenciye "Plus" rozeti gösterilecek araç mı. */
export function toolBeyondFreeDaily(toolId: string): boolean {
  const code = TOOL_ACTION[toolId];
  return Boolean(code && exceedsFreeDaily(code));
}

const KIND_NAME: Record<string, string> = {
  lesson: "Ders",
  podcast: "Podcast",
  oral: "Sözlü deneme",
  flashcards: "Kartlar",
  spaced: "Tekrar",
  quiz: "Konu testi",
  true_false: "Doğru / yanlış",
};

/** Ücretsiz hakkı aşan işin kapı cümlesi: "doldu" denmez, ne yapılabileceği söylenir. */
export function beyondFreeMessage(name: string): string {
  return `${name}, ücretsiz günlük haktan büyük bir iş; Plus'ta açık. Ders, test ve kartlar ücretsiz hakla açılmaya devam ediyor.`;
}

/**
 * Kredi kapısının cümlesi. Ücretsiz hakkı aşan işte "doldu" denmez ve geri sayım gösterilmez
 * (`beyondFreeDaily`); diğerlerinde hakkın gerçekten dolmuştur.
 */
export function creditGateCopy(kind: string, isPremium: boolean): { message: string; beyondFreeDaily: boolean } {
  const name = KIND_NAME[kind] ?? "Bu etkinlik";
  if (!isPremium && exceedsFreeDaily(actionForNodeKind(kind))) {
    return { message: beyondFreeMessage(name), beyondFreeDaily: true };
  }
  return {
    message: isPremium ? "Bu dönemki kullanım hakkın doldu." : "Bugünkü ücretsiz hakkın doldu.",
    beyondFreeDaily: false,
  };
}
