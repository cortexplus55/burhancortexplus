import type { ActionCode } from "@/lib/env";

/**
 * Kredi fiyatları — kredi sistemi v2 (8 Ekim 2026, ürün sahibinin kararı).
 * Kaynak migration'dır (20261008120000_credit_system_v2); bu tablo testin ve
 * arayüz metninin okuduğu özet. `credit_rules` satırı değişirse test
 * kırmızıya döner — sessizce ayrışmasın. Gerekçe: docs/delivery/KREDI-SISTEMI.md.
 *
 * 1 kredi = $0,001 model maliyeti (₺0,052, $1 = ₺52). Her işin kredisi
 * canlıda ölçülen maliyetinden: öğrenci hakkını hangi işe harcarsa harcasın
 * maliyetimiz hakla orantılı kalır. Öğrenci sayıyı değil yüzdeyi görür.
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
  IMAGE_SOLUTION: { credits: 10, per: "çözüm" },
  DOCUMENT_PAGE_PROCESS: { credits: 2, per: "sayfa" },
  /** Taranmış sayfa: metinli sayfa bedelinin üstüne. */
  DOCUMENT_SCAN_PAGE: { credits: 6, per: "taranmış sayfa" },
  QUIZ_GENERATE: { credits: 4, per: "test" },
  FLASHCARD_GENERATE: { credits: 3, per: "kart seti" },
  /** Üretim + değerlendirme dahil; bitişte ayrı GRADE ücreti yok. */
  PRACTICE_EXAM_GENERATE: { credits: 15, per: "deneme" },
  PRACTICE_EXAM_GRADE: { credits: 0, per: "değerlendirme" },
  STUDY_PLAN_GENERATE: { credits: 6, per: "ders" },
  PODCAST_GENERATE: { credits: 12, per: "podcast" },
  ORAL_EXAM_GENERATE: { credits: 8, per: "sözlü deneme" },
  EXPORT_PDF: { credits: 0, per: "dışa aktarma" },
  AUDIO_SYNTHESIZE: { credits: 2, per: "900 karakter" },
};

export const AUDIO_CHARS_PER_CREDIT_PRICE = 900;

/** Plus dahil sohbet mesajı ücretlidir. */
export const PLUS_CHAT_IS_FREE = false;

/** Dönem hakları (kredi). Ücretsiz günlük, haftalık plan haftalık, diğerleri aylık. */
export const PLAN_ALLOWANCES = {
  free: 6,
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

/** Bir hakkın somut karşılığı: "ayda yaklaşık 2.400 mesaj ya da 1.200 ders". */
export function allowanceInWork(allowance: number): { messages: number; lessons: number } {
  return {
    messages: Math.floor(allowance / CREDIT_PRICE_TABLE.AI_CHAT_STANDARD.credits),
    lessons: Math.floor(allowance / CREDIT_PRICE_TABLE.STUDY_PLAN_GENERATE.credits),
  };
}
