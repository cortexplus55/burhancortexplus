import type { ActionCode } from "@/lib/env";
import {
  FREE_TIER_SENTENCE,
  PLUS_ONLY_NODE_KINDS,
  freeLimitReachedLine,
  isPlusOnlyAction,
  type FreeMeter,
} from "@/lib/billing/free-meters";

/**
 * Ücretsiz hesabın neyi açamadığı (24 Ekim 2026, sayıya dayalı ücretsiz katman).
 *
 * "Plus'ta" kararı artık fiyattan değil, açık listeden gelir (`PLUS_ONLY_ACTIONS`): podcast, sözlü,
 * yazılı deneme, video ve ses. Fiyattan türetmek kredi fiyatı değişince kapıyı ters çeviriyordu (sözlü 6
 * krediye inince ücretsizde açılırdı, ders 30 krediye çıkınca "Plus" rozeti alırdı). Öteki işler sayaçla
 * açık: haftada 3 ders, günde 3 mesaj, günde 1 fotoğraf.
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

/** Plus'taki işin kapı cümlesi: "doldu" denmez, ücretsizde ne açık olduğu söylenir. */
export function beyondFreeMessage(name: string): string {
  return `${name} Plus'ta. Ücretsiz hesapta ${FREE_TIER_SENTENCE.charAt(0).toLocaleLowerCase("tr")}${FREE_TIER_SENTENCE.slice(1)} açık.`;
}

/**
 * Kredi kapısının cümlesi. Plus'taki işte "doldu" denmez ve geri sayım gösterilmez (`beyondFreeDaily`);
 * öteki işlerde ücretsiz hesabın ders sayacı dolmuştur (yolda test ve kartlar derse dahil).
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
  return { message: freeLimitReachedLine("lesson"), beyondFreeDaily: false, meter: "lesson" };
}
