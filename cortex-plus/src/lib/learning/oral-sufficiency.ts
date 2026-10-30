/**
 * Sözlü cevap yeterli mi — TEK eşik (30 Ekim 2026). Hakemin puanı %80 ve üstü: sonuç ekranının "güçlü yanların"ı,
 * bilgi eksiği listesi, günü gelen tekrar ve konu kanıtı aynı eşiği okur. Canlı tur: %88 alan cevap "Bilgi
 * eksikleri"nde duruyor ve hâkimiyete yanlış diye yazılıyordu (kanıt yalnız %99 ve üstünü doğru sayıyordu).
 *
 * Yaprak modül: hem `oral-exam.ts` hem `learning-tracking.ts` (istemci de okur) bunu içe aktarır.
 */
export const ORAL_SUFFICIENT_RATIO = 0.8;

export function oralItemSufficient(item: { ratio?: unknown } | null | undefined): boolean {
  const ratio = Number(item?.ratio);
  return Number.isFinite(ratio) && ratio >= ORAL_SUFFICIENT_RATIO;
}
