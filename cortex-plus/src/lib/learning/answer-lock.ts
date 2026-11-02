/**
 * Testte "Kontrol et" ile açılan sorunun cevabı kilitlenir (UX tur 2, 2 Kasım 2026).
 *
 * Neden: kilit yalnız bellekteydi; sayfa yenilenince açıklama kayboluyor, aynı soru yeniden
 * cevaplanabiliyordu. Artık kilitli soru sırası cevap kümesinin `__locked` anahtarında durur
 * (göçsüz, `__meta` gibi). Sunucu kayıtta ve bitişte kilitli sorunun cevabını eski haliyle tutar.
 */
export const ANSWER_LOCK_KEY = "__locked";

export function lockedKeys(answers: Record<string, unknown> | null | undefined): string[] {
  const raw = answers?.[ANSWER_LOCK_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter((key): key is string => typeof key === "string" && /^\d+$/.test(key));
}

/**
 * Gelen cevap kümesine sunucudaki kilitleri uygular: kilitli sorunun saklı cevabı değişmez, kilit
 * listesi birleşir (kilit geri alınamaz). Kilitli ama saklı cevabı olmayan soruda gelen cevap kabul edilir.
 */
export function applyAnswerLocks(
  saved: Record<string, unknown> | null | undefined,
  submitted: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...(submitted ?? {}) };
  const savedLocks = lockedKeys(saved);
  for (const key of savedLocks) {
    if (saved && saved[key] !== undefined) result[key] = saved[key];
  }
  const all = [...new Set([...savedLocks, ...lockedKeys(submitted)])].sort((a, b) => Number(a) - Number(b));
  if (all.length) result[ANSWER_LOCK_KEY] = all;
  else delete result[ANSWER_LOCK_KEY];
  return result;
}
