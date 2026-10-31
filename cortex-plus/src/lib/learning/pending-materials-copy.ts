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

/**
 * Eklenince öğrenciye söylenen başlık (31 Ekim 2026): önce "✓ Kalan sayfalar yoluna eklendi" yazıyordu ve görünmüyordu —
 * hazırlık sayfası yenilenince bekleyen kalmadığı için şerit kaldırılıyordu. Şerit artık yerinde kalır, başlık bu kadar
 * görünür.
 */
export function pendingDoneTitle(addedTopics: number): string {
  return addedTopics > 0
    ? `✓ Kalan tüm sayfalar ve ${addedTopics} yeni konu çalışma yoluna eklendi!`
    : "✓ Kalan tüm sayfalar çalışma yoluna eklendi!";
}

export function pendingDoneLine(mergedTopics: number): string {
  return mergedTopics > 0
    ? `${mergedTopics} konuya yeni kaynak eklendi. İlerlemen duruyor.`
    : "Yeni konular yolunda; ilerlemen duruyor.";
}

/** Bitiş bildirimi en az bu kadar görünür (ürün sahibi: "en az 8 saniye"). */
export const PENDING_DONE_VISIBLE_MS = 10_000;

/*
  Pencereli işleme (31 Ekim 2026): büyük belge pencere pencere yola girer; şerit yola eklenen sayfayı sayar ve her
  pencerede yolu yeniler. Taranmış kitap öğrenci ilerledikçe okunur.
*/
export const PENDING_WINDOW_TITLE = "⚡ Kitabın işleniyor";

/** "Materyal ekle" büyük belgeyi bekleyen yazınca hazırlık sayfasındaki şeridi uyandıran olay. */
export const PENDING_MATERIALS_EVENT = "cp:pending-materials";

/**
 * Şeridin başlığı tek cümle (Paket J denetimi #7, maddedeki metin): "⚡ Kitabın işleniyor: 110 / 500 sayfa yoluna
 * eklendi…". Önceden başlık ve sayı iki ayrı satırdaydı.
 */
export function pendingWindowTitle(attached: number, total: number): string {
  return total > 0
    ? `${PENDING_WINDOW_TITLE}: ${Math.min(attached, total)} / ${total} sayfa yoluna eklendi…`
    : `${PENDING_WINDOW_TITLE}…`;
}

/** Başlığın altındaki satır: sayı başlıkta, burada yalnız sıradaki adım. */
export function pendingWindowNextLine(total: number): string {
  return total > 0 ? "Sıradaki bölüm hazırlanıyor; yolun her bölümde yenilenir." : "Sayfalar okunuyor; ilk bölüm birazdan yolunda…";
}

export function pendingWindowLine(attached: number, total: number): string {
  return total > 0
    ? `${Math.min(attached, total)} / ${total} sayfa yoluna eklendi; sıradaki bölüm hazırlanıyor…`
    : "Sayfalar okunuyor; ilk bölüm birazdan yolunda…";
}

export function pendingWindowAddedLine(from: number, to: number, topics: number): string {
  const range = from === to ? `${from}. sayfa` : `${from}–${to}. sayfalar`;
  return topics > 0 ? `✓ ${range} yoluna eklendi (+${topics} konu).` : `✓ ${range} yoluna eklendi.`;
}

export const PENDING_PAUSED_TITLE = "📖 Kitabının ilk bölümleri yolunda";

export function pendingPausedLine(attached: number, total: number): string {
  const left = Math.max(0, total - attached);
  return `${attached} / ${total} sayfa yolunda. Kalan ${left} taranmış sayfa sen ilerledikçe okunacak; okunmayan sayfa kullanım hakkından düşmez.`;
}

export const PENDING_READ_ALL = "Hepsini şimdi oku";

export const PENDING_CREDITS_LINE =
  "Kalan sayfaları okumaya kullanım hakkın şu an yetmiyor. Hakkın yenilenince kaldığı yerden sürer.";

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
