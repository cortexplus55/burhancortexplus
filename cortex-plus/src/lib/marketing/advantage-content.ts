import { PHOTO_PAGE_LIMITS } from "@/lib/billing/entitlements";

/**
 * Vitrin farkları (1 Kasım 2026, ürün sahibinin isteği): ana sayfa, /ozellikler, /fiyatlandirma ve /ornek aynı
 * kaynaktan okur; metin tek yerde değişir. Kural: Cortex sütununda yazan her şey bugün üründe çalışıyor.
 * Her satırın kanıtı yanında (`evidence`, yalnız iç kayıt, ekranda gösterilmez).
 *
 * Marka kuralı: arayüzde rakip marka adı geçmez; "Yabancı AI Uygulamaları" ve "Genel Sohbet Botları" denir.
 * Bekçi: `tests/unit/advantage-content.test.ts`.
 *
 * "Diğerleri" sütunu ürün sahibinin karşılaştırma notlarından gelir; kodla doğrulanamaz.
 */

export type AdvantageRow = {
  id: string;
  feature: string;
  cortex: { verdict: string; body: string };
  others: { verdict: string; body: string };
  evidence: string[];
};

export const ADVANTAGE_SECTION = {
  kicker: "Fark tablosu",
  title: "Neden Öğrenciler Yabancı Uygulamaları Bırakıp Cortex Plus'a Geçiyor?",
  lead: "Aynı notla başla; farkı sınav haftasında gör.",
  columns: {
    feature: "Özellik",
    cortex: "Cortex Plus ✨",
    others: "Yabancı AI Uygulamaları & Genel Botlar",
  },
} as const;

export const ADVANTAGE_ROWS: AdvantageRow[] = [
  {
    id: "ikiz-sinav",
    feature: "🎯 Çıkmış Sorulardan \"Hocanın İkiz Sınavı\"",
    cortex: {
      verdict: "Var",
      body: "Geçmiş sınavı yükle; hocanın soru tarzını ve konu ağırlığını örnek alan 20 soruluk İkiz Sınav çöz.",
    },
    others: {
      verdict: "Yok",
      body: "Çıkmış soruları sıradan metin sanıp geçer, en fazla 5–9 rastgele soru verir.",
    },
    evidence: ["src/lib/learning/mock-exam/past-questions.ts", "src/lib/learning/mock-exam/types.ts (DEFAULT_STANDARD 20)"],
  },
  {
    id: "sinav-sabahi",
    feature: "⚡ Sınav Sabahı 15 Dakikalık Özet & Formül Kağıdı (PDF)",
    cortex: {
      verdict: "Var",
      body: "Sınava girmeden önce formüller, sınav tuzakları ve en çok yanıldığın noktalar tek sayfada; PDF olarak kaydet.",
    },
    others: { verdict: "Yok", body: "Tek tek tüm dersleri baştan okuman gerekir." },
    evidence: ["src/lib/learning/cram-sheet.ts", "src/components/parity/cram-print-button.tsx"],
  },
  {
    id: "hoca-uyarisi",
    feature: "⚠️ Defterdeki Yanlış Formülü Yakalayan \"Akıllı Hoca Uyarısı\" & Şekil Okuma",
    cortex: {
      verdict: "Tam Görsel Okuma",
      body: "PDF, slayt ve Word içindeki grafik ve şekilleri okur; notuna bir formülü yanlış yazdıysan derste seni uyarır.",
    },
    others: {
      verdict: "Kısmi / Eksik",
      body: "PDF içindeki grafik değerlerini göremez, defterdeki hatayı fark etmez.",
    },
    evidence: [
      "src/lib/documents/pdf-ingestion.ts (pageNeedsFigureRead)",
      "src/lib/documents/extract-office-text.ts",
      "src/lib/learning/formula-typos.ts",
      "src/lib/learning/note-rule-check.ts",
    ],
  },
  {
    id: "turkiye-uyum",
    feature: "🇹🇷 Türkiye Sınav Sistemine %100 Uyum (A–E 5 Şık, ÖSYM Formatı, Resmî Tatil Takvimi)",
    cortex: {
      verdict: "Tam Uyumlu",
      body: "Lise/YKS/KPSS/TUS/Vize için 5 şıklı (A–E), LGS için 4 şıklı (A–D) sorular; resmî tatil ve vize tarihine göre dengelenen takvim.",
    },
    others: {
      verdict: "Yabancı Standart",
      body: "Sabit 4 şıklı (A–D), takvimsiz veya sınavdan haftalar önce biten kopuk plan.",
    },
    evidence: ["src/lib/learning/student-pedagogy.ts (resolveOptionCount)", "src/lib/learning/tr-calendar.ts"],
  },
  {
    id: "ikiz-soru",
    feature: "🔥 \"İkiz Soru İle Anında İntikam\" & \"İki Şık Arasında Kaldım\" İpucu",
    cortex: {
      verdict: "Var",
      body: "Yanlış yaptığın sorunun anında ikizini çözdürür; iki şık arasında kaldığında farkı gösterir.",
    },
    others: { verdict: "Yok", body: "Sadece cevabı gösterip geçer." },
    evidence: ["src/lib/learning/twin-question.ts", "src/components/parity/exam-node/quiz.tsx"],
  },
  {
    id: "sessiz-sozlu",
    feature: "🤫 Kütüphanede Sessiz (Yazılı + Sesli) Sözlü Sınav & 1 Dk Çizimli Video",
    cortex: {
      verdict: "Her Yerde Çalışır",
      body: "Mikrofon açamadığında yazarak da sözlü sınav olabilirsin; 1 dk'lık çizimli dikey videolarla hızlı tekrar yaparsın.",
    },
    others: {
      verdict: "Mikrofon Şart",
      body: "Kütüphanede veya yurtta mikrofon izni vermezsen sözlü sınav hiç açılmaz.",
    },
    evidence: ["src/components/parity/oral-answer-desk.tsx", "src/lib/learning/video-lesson.ts"],
  },
  {
    id: "velime-link",
    feature: "👨‍👩‍👧 Kredi Kartı Olmayan Öğrenciye \"Velime WhatsApp'tan Ödeme Linki\" & Sınıfla Paylaş",
    cortex: {
      verdict: "Var",
      body: "Planını seç, veline WhatsApp'tan güvenli ödeme linki gönder; hazırlığını sınıf grubunla paylaş.",
    },
    others: {
      verdict: "Yok",
      body: "Yalnızca kredi kartı zorunluluğu ve katı aylık kullanım duvarları.",
    },
    evidence: [
      "src/lib/payments/parent-link.ts",
      "src/components/billing/parent-pay-link-button.tsx",
      "src/lib/learning/prep-invite.ts",
      "src/components/parity/prep-share-tools.tsx",
    ],
  },
];

export const ADVANTAGE_BADGES_TITLE = "6 Özel Silah";

export const ADVANTAGE_BADGES = [
  { emoji: "🎯", label: "Çıkmış Sorudan İkiz Sınav" },
  { emoji: "⚡", label: "Sınav Sabahı Kağıdı" },
  { emoji: "⚠️", label: "Defter Hatası Yakalayıcı" },
  { emoji: "🔥", label: "Anında İkiz Soru" },
  { emoji: "🤖", label: "AI Derece Öğrencisiyle Düello" },
  { emoji: "👨‍👩‍👧", label: "Velime Ödeme Linki" },
] as const;

/**
 * Kör öğrenci deneyi kanıtı: `docs/delivery/KOR-OGRENCI-DENEYI-30-EKIM.md` (ön sınav 35, son sınav 100, +65,
 * 20 soru, 6 yanılgının 6'sı düzeltildi). Öğrenci yapay zekâ ile canlandırıldı; dipnot bunu açıkça söyler.
 */
export const SHOW_BLIND_EXPERIMENT_PROOF = true;

export const BLIND_EXPERIMENT_PROOF = {
  kicker: "📈 Kanıtlanmış Öğrenme Kazanımı",
  before: { value: "35", label: "Ön sınav" },
  after: { value: "100", label: "Son sınav" },
  delta: "+65 Puan Artış",
  body:
    "Kör sınav deneyinde ön sınavdan 35 puan alan ve 6 temel kavram yanılgısına sahip öğrenci, Cortex Plus çalışma yolunu tamamladıktan sonra girdiği 20 soruluk sınavda 6 yanılgısının tamamını kırarak 100 tam puan (+65 Puan Artış) aldı.",
  footnote:
    "İç deney, 30 Ekim 2026: öğrenci yapay zekâ ile canlandırıldı, yalnız Cortex Plus derslerinden tuttuğu defterle bağımsız yazılmış 20 soruluk sınava girdi. Tek konu, tek deney.",
} as const;

export const PRICING_ADVANTAGE = {
  title: "💡 Neden Plus Paketi Özel Ders ve Yabancı Uygulamalardan Çok Daha Avantajlı?",
  items: [
    { emoji: "📚", title: "100+ sayfalık kitap ve fotoğraf seti", body: `Kalın kitap PDF'i ve el notu fotoğrafları okunur; Plus'ta ayda ${PHOTO_PAGE_LIMITS.plus} fotoğraf ya da taranmış sayfaya kadar.` },
    { emoji: "🎯", title: "İkiz Sınav", body: "Çıkmış sorulardan hocanın tarzını örnek alan deneme." },
    { emoji: "⚡", title: "Sınav Sabahı Kağıdı", body: "Formüller, tuzaklar ve yanlışların tek sayfada." },
    { emoji: "👨‍👩‍👧", title: "Velime Ödeme Linki", body: "Kartın yoksa veline WhatsApp'tan güvenli link gönder." },
  ],
} as const;

/** Rakip marka adları: arayüz metninde hiç geçmez. */
export const FORBIDDEN_BRAND_NAMES = ["Astra", "ChatGPT", "Gemini", "Claude", "Copilot", "Photomath", "Quizlet"] as const;

/** Bekçi testinin taradığı bütün vitrin metni. */
export function allAdvantageCopy(): string {
  return [
    ...Object.values(ADVANTAGE_SECTION).flatMap((v) => (typeof v === "string" ? [v] : Object.values(v))),
    ...ADVANTAGE_ROWS.flatMap((r) => [r.feature, r.cortex.verdict, r.cortex.body, r.others.verdict, r.others.body]),
    ADVANTAGE_BADGES_TITLE,
    ...ADVANTAGE_BADGES.map((b) => b.label),
    ...Object.values(BLIND_EXPERIMENT_PROOF).flatMap((v) => (typeof v === "string" ? [v] : Object.values(v))),
    PRICING_ADVANTAGE.title,
    ...PRICING_ADVANTAGE.items.flatMap((i) => [i.title, i.body]),
  ].join("\n");
}
