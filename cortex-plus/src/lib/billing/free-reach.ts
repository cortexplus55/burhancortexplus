import type { ActionCode } from "@/lib/env";
import {
  FREE_TIER_SENTENCE,
  PLUS_ONLY_NODE_KINDS,
  isPlusOnlyAction,
  type FreeMeter,
} from "@/lib/billing/free-meters";

/**
 * Ücretsiz hesabın neyi açamadığı (24 Ekim 2026, sayıya dayalı ücretsiz katman).
 *
 * "Plus'ta" kararı artık fiyattan değil, açık listeden gelir (`PLUS_ONLY_ACTIONS`): podcast, sözlü,
 * yazılı deneme, video ve ses. Fiyattan türetmek kredi fiyatı değişince kapıyı ters çeviriyordu (sözlü 6
 * krediye inince ücretsizde açılırdı, ders 30 krediye çıkınca "Plus" rozeti alırdı). Öteki işler sayaçla
 * açık: günde 3 mesaj, günde 1 fotoğraf.
 *
 * 11 Kasım 2026 akşamı (ürün sahibinin kararı): ücretsiz hesap = tek ders. Ders sayacına düşen üretim (Çalışma
 * Stüdyosu'nda test, kart, doğru/yanlış; "Farklı anlat"; yeniden yazım) ilk dersin döngüsü dışında Plus'a yönlenir
 * (`needsPlusOutsideFirstLesson`, `free-lesson-gate.ts`); kapı "doldu" demez, geri sayım göstermez.
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

/** İş ücretsiz hesapta hiç açılmıyor mu (Plus'ta). Adı eski; anlamı artık açık liste. */
export function exceedsFreeDaily(code: ActionCode): boolean {
  return isPlusOnlyAction(code);
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
  written_exam: "Yazılı deneme",
  flashcards: "Kartlar",
  spaced: "Kartlarla tekrar",
  quiz: "Konu testi",
  true_false: "Doğru / yanlış",
};

/** Ders sayacına düşen işin kapıdaki adı (yol adımı, "Farklı anlat", yeniden yazım). */
export const FREE_LESSON_WORK_NAME = "Bu çalışma";
/** Çalışma Stüdyosu'nda ders sayacına düşen üretimin kapıdaki adı. */
export const STUDIO_GENERATION_NAME = "Stüdyoda test, kart ve doğru/yanlış üretimi";

/** Plus'taki işin kapı cümlesi: "doldu" denmez, ücretsizde ne açık olduğu söylenir. */
export function beyondFreeMessage(name: string): string {
  return `${name} Plus'ta. Ücretsiz hesapta ${FREE_TIER_SENTENCE.charAt(0).toLocaleLowerCase("tr")}${FREE_TIER_SENTENCE.slice(1)} açık.`;
}

/**
 * Kredi kapısının cümlesi. Ücretsiz hesapta "doldu" denmez ve geri sayım gösterilmez (`beyondFreeDaily`): iş ya
 * Plus'a özeldir ya da ilk dersin döngüsü dışında kalan üretimdir (11 Kasım 2026 akşamı: ders sayacının hakkı yok).
 * Dolan gerçek sayaçları (mesaj, fotoğraf, derse dahil adımların günlük sınırı) 402'nin kodu söyler (`nodeGateForCode`).
 */
export function creditGateCopy(
  kind: string,
  isPremium: boolean,
): { message: string; beyondFreeDaily: boolean; meter?: FreeMeter } {
  const name = KIND_NAME[kind] ?? "Bu etkinlik";
  if (isPremium) return { message: "Bu dönemki kullanım hakkın doldu.", beyondFreeDaily: false };
  if (PLUS_ONLY_NODE_KINDS.has(kind) || exceedsFreeDaily(actionForNodeKind(kind))) {
    return { message: beyondFreeMessage(name), beyondFreeDaily: true };
  }
  return { message: beyondFreeMessage(FREE_LESSON_WORK_NAME), beyondFreeDaily: true };
}
