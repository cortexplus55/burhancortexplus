/** Grafiğe giden yüzde: sayı değilse 0, 0-100 dışını kırpar. */
export function safePct(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/** Sonlu ve sıfırdan büyük değilse `fallback`. */
export function safePositive(value: unknown, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
