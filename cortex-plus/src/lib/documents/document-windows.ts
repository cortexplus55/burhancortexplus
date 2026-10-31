/*
  Pencereli işleme (31 Ekim 2026, ürün sahibi: "400, 600 ya da 1.000 sayfalık kitap da aynı kararlılıkla çalışsın").

  Büyük belge (D) hazırlığa tek seferde değil, pencere pencere girer: öğrenci ilk 12 sayfanın baş kopyasıyla başlar;
  kalan sayfalar 40'ar sayfalık pencerelere bölünür. Her pencere okunur okunmaz gizli bir kopyası (document-head.ts
  `ensureDocumentPart`, sayfa numaraları D'ninkiyle aynı) çıkarılır, hazırlığın konu adlarıyla küçük bir harita
  çıkar (40 sayfa: ~12 sn, ~2.000 jeton) ve "materyal ekle" yoluyla yola eklenir; bir sonraki pencere bu sırada
  okunur. Hiçbir okuma adımı ya da harita çağrısı belgenin tamamını görmez; bir istek süresi dolunca iş kaldığı
  yerden sürer (pending-windows.ts). Bu dosya yalnız hesap: hangi pencere sırada, okuma duraklasın mı.
*/

/** Pencere boyu: okuma adımıyla aynı (pdf-ingestion `PDF_PAGES_PER_STEP`); baş kopyasından sonra adımlar hizalı. */
export const WINDOW_PAGES = 40;
/** Son pencereden sonra bu kadar ya da daha az sayfa kalırsa son pencereye katılır (pencere 40-50 sayfa). */
export const WINDOW_TAIL_MERGE = 10;
/** Bu kadar ya da daha az sayfalı belge pencereye bölünmez: kendisi haritalanıp eklenir (kopya gerekmez). */
export const SINGLE_WINDOW_MAX_PAGES = WINDOW_PAGES + WINDOW_TAIL_MERGE;
/**
 * Kurulumdan sonraki arka plan okuması (process route) bu sayfada durur: baş kopyası + iki pencere. Gerisini pencere
 * işçisi okutur; taranmış kitapta öğrencinin ilerleyişine göre.
 */
export const HEAD_READ_AHEAD_PAGES = 12 + 2 * WINDOW_PAGES;
/**
 * Taranmış kitap öğrenci ilerledikçe okunur: yolda bitmemiş bu kadar ders varken sonraki taranmış pencere okunmaz
 * (görüntü okuması hem dakikalar sürer hem kullanım hakkından düşer). Öğrenci "Hepsini şimdi oku" derse sürer.
 */
export const SCANNED_LESSONS_AHEAD = 12;

export type PageWindow = { from: number; to: number };

/**
 * Eklenmiş son sayfadan sonraki pencere. Belge bitiyorsa son kısa parça (≤ `WINDOW_TAIL_MERGE`) son pencereye
 * katılır. Hepsi eklendiyse null.
 */
export function nextWindow(input: { attachedThrough: number; total: number }): PageWindow | null {
  const from = Math.max(0, input.attachedThrough) + 1;
  if (from > input.total) return null;
  let to = Math.min(input.total, from + WINDOW_PAGES - 1);
  if (input.total - to <= WINDOW_TAIL_MERGE) to = input.total;
  return { from, to };
}

/** Belgenin baştan sona pencereleri (sınama ve ilerleme metni için). */
export function planWindows(input: { attachedThrough: number; total: number }): PageWindow[] {
  const out: PageWindow[] = [];
  let through = input.attachedThrough;
  for (;;) {
    const window = nextWindow({ attachedThrough: through, total: input.total });
    if (!window) return out;
    out.push(window);
    through = window.to;
  }
}

/**
 * Kesintisiz eklenmiş son sayfa: parçalar (baş kopyası + pencereler) 1. sayfadan başlayarak arka arkaya gelmeli.
 * Araya boşluk düşerse (yarım kalmış kopya) boşluktan sonrası sayılmaz; o pencere yeniden kopyalanır.
 */
export function attachedThroughFrom(parts: readonly { firstPage: number; lastPage: number }[]): number {
  let through = 0;
  for (const part of [...parts].sort((a, b) => a.firstPage - b.firstPage)) {
    if (part.firstPage > through + 1) break;
    through = Math.max(through, part.lastPage);
  }
  return through;
}

/**
 * Belge pencereye bölünecek mi: baş kopyası varsa her zaman (kalan sayfalar kopyalarla eklenir), yoksa yalnız
 * tek pencereye sığmıyorsa. Küçük belge kendisiyle eklenir.
 */
export function usesWindows(input: { total: number; hasParts: boolean }): boolean {
  return input.hasParts || input.total > SINGLE_WINDOW_MAX_PAGES;
}

/**
 * Taranmış kitapta okuma duraklasın mı: öğrencinin önünde yeterince ders varken ve öğrenci "Hepsini şimdi oku"
 * demediyse. Metinli belge duraklamaz (okuması hızlı, arama ve sohbet bütün metni ister).
 */
export function shouldPauseReading(input: { scanned: boolean; lessonsAhead: number; eager: boolean }): boolean {
  return input.scanned && !input.eager && input.lessonsAhead >= SCANNED_LESSONS_AHEAD;
}
