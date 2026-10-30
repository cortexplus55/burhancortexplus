/**
 * Serbest metni kırpar (30 Ekim 2026, Paket I #12): boşlukları birleştirir, uçları kırpar, en çok
 * `max` karaktere indirir. İstemci ve sunucu aynı işlevi kullanır; sunucu uzun metni reddetmez.
 */
export function clampText(value: string, max: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, max).trim();
}
