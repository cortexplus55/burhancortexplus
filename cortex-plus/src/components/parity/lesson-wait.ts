/**
 * Ders yazılırken sondaki "Sıradaki bölüm yazılıyor" kartının kuralları (3 Kasım 2026, canlı: ~30 sn bekleme).
 * Öğrenci 8 sn'den uzun beklemez: ana yazım bittiyse kart hiç konmaz; sürüyorsa 8 sn sonra çıkış sunulur.
 */
export const LESSON_WAIT_LIMIT_MS = 8_000;

export function showsWaitStep(building: boolean, writingDone: boolean, gaveUp: boolean): boolean {
  return building && !writingDone && !gaveUp;
}

/** Yazım sürerken ekranın yeni kavramları sorma aralığı. */
export const LESSON_PROGRESS_POLL_MS = 1_500;
/** İlk saniyelerde sık sorulur (3 Kasım 2026): giriş paragrafları ~0,5 sn arayla yayımlanıyor, 1,5 sn turu ilk metni geciktiriyordu. */
export const LESSON_PROGRESS_FAST_POLL_MS = 400;
export const LESSON_PROGRESS_FAST_POLLS = 8;
export function lessonProgressDelay(polls: number): number {
  return polls < LESSON_PROGRESS_FAST_POLLS ? LESSON_PROGRESS_FAST_POLL_MS : LESSON_PROGRESS_POLL_MS;
}
