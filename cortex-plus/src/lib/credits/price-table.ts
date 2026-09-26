import type { ActionCode } from "@/lib/env";

/**
 * Kredi fiyatları. Kaynak migration'lardır; bu tablo testin ve arayüz
 * ipucunun okuduğu özet. Veritabanındaki `credit_rules` satırı değişirse
 * test kırmızıya döner — sessizce ayrışmasın.
 *
 * Plus sohbeti bedava değildir. Her mesaj `AI_CHAT_STANDARD` (1 kr).
 * Gelişmiş modeli Plus isteyemez; istese de standart fiyata düşer.
 * Podcast'in ayrı bir fiyatı yoktur: senaryo `STUDY_PLAN_GENERATE` (2 kr),
 * ses `AUDIO_SYNTHESIZE` (900 karakter = 1 kr, önbellek 0).
 */
export type CreditPrice = {
  credits: number;
  per: string;
};

export const CREDIT_PRICE_TABLE: Record<ActionCode, CreditPrice> = {
  AI_CHAT_STANDARD: { credits: 1, per: "mesaj" },
  AI_CHAT_ADVANCED: { credits: 3, per: "mesaj" },
  AI_CHAT_PARENT: { credits: 0, per: "mesaj" },
  IMAGE_SOLUTION: { credits: 5, per: "çözüm" },
  DOCUMENT_PAGE_PROCESS: { credits: 2, per: "sayfa" },
  QUIZ_GENERATE: { credits: 2, per: "üretim" },
  FLASHCARD_GENERATE: { credits: 2, per: "üretim" },
  /** Üretim + değerlendirme dahil; bitişte ayrı GRADE ücreti yok. */
  PRACTICE_EXAM_GENERATE: { credits: 8, per: "deneme" },
  PRACTICE_EXAM_GRADE: { credits: 0, per: "değerlendirme" },
  STUDY_PLAN_GENERATE: { credits: 2, per: "üretim" },
  EXPORT_PDF: { credits: 1, per: "dışa aktarma" },
  AUDIO_SYNTHESIZE: { credits: 1, per: "900 karakter" },
};

export const AUDIO_CHARS_PER_CREDIT_PRICE = 900;

/** Plus dahil sohbet mesajı ücretlidir. */
export const PLUS_CHAT_IS_FREE = false;
