/*
  Öğretmenin düşünme satırı (öğretmen v3, 21 Kasım 2026, ürün sahibinin istemi). Yanıt beklenirken üç aşama sırayla:
  ilk ikisi süreye göre, üçüncüsü ilk parça gelince. Yanıt tamamlanınca satır "💡 N sn düşündü" etiketine döner; N gönderimden
  ilk parçaya geçen GERÇEK saniyedir (en az 1). Saf; ders ya da konu sözcüğü yok.
*/

export const THINKING_PHASES = ["Bilgileri birleştiriyor", "Verileri analiz ediyor", "Yanıtı yazıyor"] as const;
export type ThinkingPhase = (typeof THINKING_PHASES)[number];

/** İkinci aşamaya geçiş (ilk parça bundan önce gelirse ikinci aşama hiç görünmez). */
export const THINKING_SECOND_AT_MS = 1800;

export function thinkingPhase(elapsedMs: number, writing: boolean): ThinkingPhase {
  if (writing) return THINKING_PHASES[2];
  return elapsedMs >= THINKING_SECOND_AT_MS ? THINKING_PHASES[1] : THINKING_PHASES[0];
}

/** "💡 N sn düşündü": N gönderimden ilk parçaya geçen saniye, en az 1. */
export function thoughtLabel(ms: number): string {
  const seconds = Math.max(1, Math.round(Math.max(0, ms) / 1000));
  return `💡 ${seconds} sn düşündü`;
}
