/**
 * Synthetic OCR page texts that reproduce scanned-book failure shapes.
 * Half use neutral placeholders (SERİ / ÜNİTE A); half use KPSS shapes.
 */

export type SyntheticOcrPage = {
  pageNumber: number;
  text: string;
  pageKind?: string;
};

function page(
  pageNumber: number,
  lines: string[],
  pageKind = "content",
): SyntheticOcrPage {
  return { pageNumber, text: lines.join("\n"), pageKind };
}

/** ~30 pages covering fences, series+unit headers, question stems, options, years. */
export const SYNTHETIC_OCR_PAGES: SyntheticOcrPage[] = [
  page(1, ["```plaintext", "SERİ ÜNİTE A", "1. Temel Kavramlar ve Tanımlar", "Bu ünite temel kavramları anlatır."]),
  page(2, ["SERİ ÜNİTE A", "Temel kavramlar metni devam eder.", "Formül: $E=mc^2$ korunur."]),
  page(3, ["SERİ ÜNİTE A", "2. Uygulama Alanları", "Uygulama alanı açıklaması."]),
  page(4, ["SERİ ÜNİTE A", "12. Aşağıdakilerden hangisi doğru", "A) Birinci şık", "B) İkinci şık", "C) Üçüncü şık", "D) Dördüncü şık", "E) Beşinci şık"]),
  page(5, ["SERİ ÜNİTE A", "I. Birinci önerme", "II. İkinci önerme", "III. Üçüncü önerme", "Which of the following is correct?"]),
  page(6, ["SERİ ÜNİTE B", "3. İleri Konular", "İleri konulara giriş."]),
  page(7, ["SERİ ÜNİTE B", "İleri konular devam.", "SERİ Test 1", "1. What is the main idea", "A) Option one", "B) Option two"]),
  page(8, ["SERİ ÜNİTE B", "1982 Anayasası'nın Temel İlkeleri", "Yıl başlıklı gerçek bir bölüm."]),
  page(9, ["SERİ ÜNİTE B", "Bu hüküm-", "kesilmiş satır örneği."]),
  // KPSS-shaped run: YASAMA ×8
  ...Array.from({ length: 8 }, (_, i) =>
    page(10 + i, [
      "KPSS YASAMA",
      i === 0 ? "TBMM Seçimleri ve Yapısı" : `Yasama anlatımı sayfa ${i + 1}.`,
      i === 3
        ? "12. Aşağıdakilerden hangisi TBMM üyeliğinin düşme"
        : "Yasama organı görevleri.",
      i === 3 ? "A) Seçim" : "",
      i === 3 ? "B) İstifa" : "",
      i === 3 ? "C) Kamu Denetçiliği Kurumu" : "",
    ].filter(Boolean)),
  ),
  // KPSS-shaped run: YÜRÜTME ×6
  ...Array.from({ length: 6 }, (_, i) =>
    page(18 + i, [
      "KPSS YÜRÜTME",
      i === 0 ? "Cumhurbaşkanlığı Kararnamesi" : `Yürütme anlatımı ${i + 1}.`,
      i === 2 ? "Millî Güvenlik Kurulu ile ilgili aşağıdakilerden" : "Yürütme organı.",
    ]),
  ),
  page(24, [
    "KPSS Test 1",
    "1. Aşağıdakilerden hangisi ceza hukukunda \"suçta",
    "A) Fiil",
    "B) Kusur",
    "C) Kamu Denetçiliği Kurumu",
    "D) Sonuç",
    "E) Teşebbüs",
  ]),
  page(25, ["KPSS", "Bare series label only on this line.", "Gerçek konu: İnsan Hakları Kavramı"]),
  page(26, [
    "BIO 101 | Cell Biology",
    "Chapter 3 Cell Membrane Structure",
    "The membrane controls transport.",
  ]),
  page(27, [
    "BIO 101 | Cell Biology",
    "Which of the following is true?",
    "A) Nucleus only",
    "B) Membrane proteins",
    "C) Vacuole",
    "D) Wall",
    "E) Capsule",
  ]),
  page(28, [
    "BIO 101 | Cell Biology",
    "Chapter 4 Photosynthesis",
    "Light reactions and Calvin cycle.",
  ]),
  page(29, [
    "```plaintext",
    "KPSS YASAMA",
    "Kanunların Yapılması ve Yürürlüğe Girmesi",
  ]),
  page(30, [
    "KPSS TEMEL HAK VE HÜRRİYETLER",
    "Din ve Vicdan Hürriyeti",
    "maddeye göre",
  ]),
];

/** Neutral-only subset for series/unit detection without KPSS. */
export const NEUTRAL_SERIES_PAGES: SyntheticOcrPage[] = SYNTHETIC_OCR_PAGES.filter((p) =>
  p.text.includes("SERİ"),
);

/** English BIO 101 subset. */
export const ENGLISH_OCR_PAGES: SyntheticOcrPage[] = SYNTHETIC_OCR_PAGES.filter((p) =>
  p.text.includes("BIO 101"),
);
