/**
 * Ücretsiz katmanın sınırları ve cümleleri (3 Ekim 2026, ürün sahibinin
 * kararı). Tek kaynak: sunucu kontrolleri (`free-pages.ts`,
 * `free-prep-limit.ts`) ve fiyat tablosu buradan okur. İstemci de okuduğu
 * için `server-only` yok. Günlük hak (2 kredi = bir ders) SQL'de:
 * 20261003120000_free_tier_one_lesson.
 */
/** Ücretsiz hesabın kurabileceği sınav hazırlığı sayısı. */
export const FREE_PREP_LIMIT = 1;
/** Ücretsiz hesabın toplam işletebileceği belge sayfası. */
export const FREE_PAGE_TOTAL = 5;

export const FREE_PREP_LIMIT_MESSAGE =
  "Ücretsiz planda bir sınav hazırlığı kurabilirsin. Yenisini kurmak için Plus'a geç.";

export const FREE_PREP_LIMIT_CODE = "free_prep_limit";

/** "Ücretsiz planda 211 sayfalık belgenin ilk 5 sayfası işlenecek." */
export function freePageCapLine(pageCount: number, remaining: number): string {
  return `Ücretsiz planda ${pageCount} sayfalık belgenin ilk ${remaining} sayfası işlenecek. Tamamı için Plus'a geç.`;
}
