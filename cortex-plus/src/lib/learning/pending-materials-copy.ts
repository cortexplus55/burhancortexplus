/**
 * Hızlı başlatma şeridinin cümleleri (31 Ekim 2026). Öğrenci hazır olan materyalle hazırlığa girdi; kalan sayfalar
 * arkada okunuyor, sonra konuları çıkarılıp yoluna ekleniyor. Sayılar sayfa sayısıdır, kredi değil.
 */

export const PENDING_TITLE = "⚡ İlk konuların hazır!";

export function pendingReadingLine(pagesDone: number, pageCount: number): string {
  return pageCount > 0
    ? `Kalan sayfalar arka planda işleniyor (${Math.min(pagesDone, pageCount)}/${pageCount})…`
    : "Kalan sayfalar arka planda işleniyor…";
}

export const PENDING_MAPPING_LINE = "Kalan sayfaların konuları çıkarılıyor; birazdan yoluna eklenecek…";

export const PENDING_STALLED_LINE = "Kalan sayfaların okunması yarıda kaldı. Tekrar dene ile kaldığı yerden sürer.";

export function pendingFailedLine(names: readonly string[]): string {
  const shown = names.slice(0, 2).join(", ");
  const more = names.length > 2 ? ` ve ${names.length - 2} belge daha` : "";
  return `${shown}${more} okunamadı. Kaldırabilir ya da yeniden deneyebilirsin; hazırlığın etkilenmez.`;
}

export const PENDING_DONE_TITLE = "✓ Kalan sayfalar yoluna eklendi";

/** Toplam okuma ilerlemesi: bilinen sayfa sayıları üzerinden (bilinmeyen belge toplama girmez). */
export function pendingProgress(items: readonly { pagesDone: number | null; pageCount: number | null }[]): {
  done: number;
  total: number;
} {
  let done = 0;
  let total = 0;
  for (const item of items) {
    if (item.pageCount == null || item.pageCount <= 0) continue;
    total += item.pageCount;
    done += Math.min(item.pageCount, Math.max(0, item.pagesDone ?? 0));
  }
  return { done, total };
}
