/**
 * Yazılı denemede serbest süre (Astra, 1 Ekim 2026): öğrenci süreyi kendisi
 * seçer ya da süresiz çözer. Soru sayısı uzunluk seçeneğinden gelir.
 *
 * Süresiz deneme `duration_minutes = 0` ile saklanır: bitiş zamanı yazılmaz,
 * süre dolunca otomatik gönderim olmaz.
 */
export const MOCK_MINUTES_MIN = 10;
export const MOCK_MINUTES_MAX = 180;
export const MOCK_MINUTES_STEP = 5;
export const UNTIMED_MINUTES = 0;

/** İstekten gelen süre: 0 süresiz; diğerleri sınırlar içinde 5'in katı. */
export function clampMockMinutes(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value <= 0) return UNTIMED_MINUTES;
  const stepped = Math.round(value / MOCK_MINUTES_STEP) * MOCK_MINUTES_STEP;
  return Math.min(MOCK_MINUTES_MAX, Math.max(MOCK_MINUTES_MIN, stepped));
}

export function isUntimed(durationMinutes: unknown): boolean {
  return Number(durationMinutes) === UNTIMED_MINUTES && durationMinutes !== null && durationMinutes !== undefined;
}

export function mockDurationLabel(durationMinutes: number | null | undefined): string {
  if (durationMinutes == null) return "—";
  return durationMinutes === UNTIMED_MINUTES ? "Süresiz" : `${durationMinutes} dk`;
}
