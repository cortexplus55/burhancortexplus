import type { ActionCode } from "@/lib/env";

/**
 * Kredi fiyatları — kredi sistemi v3 (24 Ekim 2026, ürün sahibinin kararı).
 * Kaynak migration'dır (20261024120000_credit_prices_v3; önce 20261008120000_credit_system_v2); bu tablo
 * testin ve arayüz metninin okuduğu özet. `credit_rules` satırı değişirse test kırmızıya döner — sessizce
 * ayrışmasın. Gerekçe: docs/delivery/KREDI-SISTEMI.md, ölçüm: docs/delivery/MALIYET-VERGI-24-EKIM.md.
 *
 * 1 kredi ≈ $0,001 gerçek maliyet (23 Ekim ölçümü). v2'de ders, test ve mesaj ölçülen maliyetin 2-5 katı
 * altındaydı; hakkın tamamını kullanan Plus öğrencisi zarar ettiriyordu. Öğrenci sayıyı değil yüzdeyi görür.
 * Ücretsiz hesap krediyle değil sayaçla çalışır (`free-meters.ts`).
 *
 * Gelişmiş sohbet de luna'da çalışıyor; fiyatı standartla aynı.
 */
export type CreditPrice = {
  credits: number;
  per: string;
};

export const CREDIT_PRICE_TABLE: Record<ActionCode, CreditPrice> = {
  AI_CHAT_STANDARD: { credits: 3, per: "mesaj" },
  AI_CHAT_ADVANCED: { credits: 3, per: "mesaj" },
  AI_CHAT_PARENT: { credits: 0, per: "mesaj" },
  VOICE_TURN: { credits: 6, per: "sesli tur" },
  IMAGE_SOLUTION: { credits: 4, per: "çözüm" },
  DOCUMENT_PAGE_PROCESS: { credits: 5, per: "sayfa" },
  /** Taranmış sayfa: metinli sayfa bedelinin üstüne. */
  DOCUMENT_SCAN_PAGE: { credits: 6, per: "taranmış sayfa" },
  QUIZ_GENERATE: { credits: 10, per: "test" },
  FLASHCARD_GENERATE: { credits: 4, per: "kart seti" },
  /** Üretim + değerlendirme dahil; bitişte ayrı GRADE ücreti yok. */
  PRACTICE_EXAM_GENERATE: { credits: 15, per: "deneme" },
  PRACTICE_EXAM_GRADE: { credits: 0, per: "değerlendirme" },
  STUDY_PLAN_GENERATE: { credits: 30, per: "ders" },
  PODCAST_GENERATE: { credits: 12, per: "podcast" },
  ORAL_EXAM_GENERATE: { credits: 6, per: "sözlü deneme" },
  /**
   * Video ders (17 Ekim 2026): 6-8 sahne resmi + ~1 dk seslendirme + senaryo. Resimler
   * işin büyük kısmı (Astra: "Aylık limitinden daha fazlasını kullanır"); yalnız Plus.
   */
  VIDEO_GENERATE: { credits: 280, per: "video ders" },
  EXPORT_PDF: { credits: 0, per: "dışa aktarma" },
  /** 19 Ekim 2026: 2 → 15 (ölçülen maliyet 900 karakter ≈ $0,015; göç 20261019130000). */
  AUDIO_SYNTHESIZE: { credits: 15, per: "900 karakter" },
};

export const AUDIO_CHARS_PER_CREDIT_PRICE = 900;

/** Plus dahil sohbet mesajı ücretlidir. */
export const PLUS_CHAT_IS_FREE = false;

/**
 * Dönem hakları (kredi). Haftalık plan haftalık, diğerleri aylık. Ücretsiz hesabın kredisi yok (24 Ekim 2026):
 * haftada 3 ders, günde 3 mesaj, günde 1 fotoğraf sayaçla. Yıllık planlar satıştan kalktı; satır elinde
 * yıllık abonelik olan için duruyor.
 */
export const PLAN_ALLOWANCES = {
  free: 0,
  plusWeekly: 2700,
  plusMonthly: 7200,
  plusYearly: 7200,
  sigmaMonthly: 60000,
  sigmaYearly: 60000,
} as const;

/** Ek paketler: tam kullanımda bile %50 kâr. */
export const ADDON_PACKS = [
  { slug: "ek-kredi-50", credits: 1000, priceTry: 129 },
  { slug: "ek-kredi-150", credits: 2500, priceTry: 329 },
  { slug: "ek-kredi-400", credits: 5750, priceTry: 749 },
] as const;

/** Bir hakkın somut karşılığı: "ayda yaklaşık 2.400 mesaj ya da 240 ders". */
export function allowanceInWork(allowance: number): { messages: number; lessons: number } {
  return {
    messages: Math.floor(allowance / CREDIT_PRICE_TABLE.AI_CHAT_STANDARD.credits),
    lessons: Math.floor(allowance / CREDIT_PRICE_TABLE.STUDY_PLAN_GENERATE.credits),
  };
}
