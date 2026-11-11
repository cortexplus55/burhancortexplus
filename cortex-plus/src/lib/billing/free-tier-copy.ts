/**
 * Ücretsiz katmanın sınırları ve cümleleri (3 Ekim 2026, ürün sahibinin
 * kararı). Tek kaynak: sunucu kontrolleri (`free-pages.ts`,
 * `free-prep-limit.ts`) ve fiyat tablosu buradan okur. İstemci de okuduğu
 * için `server-only` yok. Ders, mesaj ve fotoğraf sayaçları `free-meters.ts`te (24 Ekim 2026);
 * SQL: 20261024121000_free_tier_counts (sayaçlar), 20261024123000_free_daily_zero (günlük kredi 0).
 */
/** Ücretsiz hesabın kurabileceği sınav hazırlığı sayısı. */
export const FREE_PREP_LIMIT = 1;
/**
 * Ücretsiz hesabın toplam işletebileceği belge sayfası. 31 Ekim 2026 (ürün sahibinin kararı, Paket J1 #3, "ilk doz
 * bedava"): 5 → 25. Ücretsiz hesap tek hazırlık kurabildiği için bu, ilk hazırlığın belgesi: konu haritasının
 * tamamını görür, 1. konuyu tam kalitede bitirir (free-topic-gate.ts). Fotoğraf / taranmış sayfa da aynı sayıda.
 */
export const FREE_PAGE_TOTAL = 25;

/**
 * İlk dersin temel döngüsü (11 Kasım 2026, ürün sahibinin kararı): ücretsiz hesapta ilk hazırlığın ilk dersi süreye
 * takılmadan açık (`first-lesson-cycle.ts`). Aynı günün akşamı haftalık ders hakkı kalktı: ücretsiz hesapta ders
 * yalnız bu ilk derstir, devamı Plus'ta (`free-lesson-gate.ts`). Adımlar yoldaki sırasıyla.
 */
export const FIRST_LESSON_STEPS = ["Konu Anlatımı", "Kartlar", "Doğru/Yanlış", "Konu Testi"] as const;

/**
 * Ücretsiz hesapta hiç açılmayanlar: ilk dördü kredi kapısında (`PLUS_ONLY_ACTIONS`, SQL `plus_only_action`), sınav
 * sabahı kâğıdı sayfa kapısında (kredi işi değil; `sinav-sabahi/page.tsx`). Bekçi test listeyi kapılarla karşılaştırır.
 */
export const PLUS_ONLY_FEATURES = ["Podcast", "Video", "Sözlü", "Yazılı Deneme", "Sınav Sabahı Kâğıdı"] as const;

/** "A, B ve C". */
function listWithAnd(items: readonly string[]): string {
  return items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} ve ${items[items.length - 1]}`;
}

/** Pazarlama ve fiyat yüzeylerinin tek cümlesi. "Sınırsız" denmez: süre sınırı yok, günlük kötüye kullanım sınırı var. */
export const FREE_FIRST_LESSON_SENTENCE = `İlk hazırlığında ilk dersin (${FIRST_LESSON_STEPS.join(" + ")}) süre sınırı olmadan ücretsiz.`;

export const PLUS_ONLY_SENTENCE = `${listWithAnd(PLUS_ONLY_FEATURES)} Plus'a özeldir.`;

/** Cümle içinde kullanılan hâli ("… açık; ayrıca …"): `FREE_TIER_SENTENCE` bununla başlar. */
export const FREE_FIRST_LESSON_CLAUSE = `İlk hazırlığında ilk dersin (${listWithAnd(
  FIRST_LESSON_STEPS.map((step) => step.toLocaleLowerCase("tr")),
)}) süre sınırı olmadan açık`;

/**
 * Belge ve hazırlık sınırı (11 Kasım 2026 akşamı, ürün sahibinin kararı: sınır aynı kalır; kapıda ve fiyat
 * yüzeylerinde görünür olur, Plus'a yönlendirir). Kapı, /krediler, /yardim ve hoş geldin e-postası bu cümleyi okur.
 */
export const FREE_DOCUMENT_SENTENCE = `Ücretsiz hesapta tek sınav hazırlığı ve toplam ${FREE_PAGE_TOTAL} sayfa belge var; daha fazlası Plus'ta.`;

export const FREE_PREP_LIMIT_MESSAGE =
  "Ücretsiz planda bir sınav hazırlığı kurabilirsin. Yenisini kurmak için Plus'a geç.";

export const FREE_PREP_LIMIT_CODE = "free_prep_limit";

/** "Ücretsiz planda 211 sayfalık belgenin ilk 5 sayfası işlenecek." */
export function freePageCapLine(pageCount: number, remaining: number): string {
  return `Ücretsiz planda ${pageCount} sayfalık belgenin ilk ${remaining} sayfası işlenecek. Tamamı için Plus'a geç.`;
}
