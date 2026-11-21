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
 *
 * Kredi kuralı yedeği (29 Ekim 2026): göç DEĞİŞİKLİĞİN kaynağıdır; kod yalnız EKSİK satırı ekler, var olanı
 * ezmez. Yeni bir eylem kodunun göçü canlıda atlanırsa SQL `invalid_action` fırlatıyor ve iş 409 ile
 * düşüyordu. `reserveCredits` o anda satırı `creditRuleSeed` ile ekler (yalnız ekleme, `ignoreDuplicates`)
 * ve bir kez yeniden dener; `/admin/sistem` koddan eklenmiş satırı `CODE_SEEDED_RULE_NOTE` ile tanıyıp
 * "göç yazılmalı" uyarısı gösterir. Fiyat değişikliği yine yalnız göçle.
 */
export type CreditPrice = {
  credits: number;
  per: string;
};

export const CREDIT_PRICE_TABLE: Record<ActionCode, CreditPrice> = {
  /** Faz 4 (19 Kasım 2026, Burhan'ın kararı): 3 → 1. Göç 20261119120000_faz4_credit_economy. */
  AI_CHAT_STANDARD: { credits: 1, per: "mesaj" },
  AI_CHAT_ADVANCED: { credits: 1, per: "mesaj" },
  AI_CHAT_PARENT: { credits: 0, per: "mesaj" },
  VOICE_TURN: { credits: 6, per: "sesli tur" },
  IMAGE_SOLUTION: { credits: 4, per: "çözüm" },
  /**
   * Faz 4: metin katmanı olan PDF / DOCX / PPTX sayfası. Birim "5 metin sayfası": belge başına
   * ceil(metin sayfası / 5) kredi (`documentUploadCredits`). Yalnız ilk yüklemede, bir kez.
   */
  DOCUMENT_PAGE_PROCESS: { credits: 1, per: "5 metin sayfası" },
  /** Faz 4: kamerayla çekilen fotoğraf ya da taranmış (Vision OCR) sayfa: sayfa başına 5 (toplam bedel). */
  DOCUMENT_SCAN_PAGE: { credits: 5, per: "fotoğraf / taranmış sayfa" },
  /** Faz 4: 10 → 14. */
  QUIZ_GENERATE: { credits: 14, per: "test" },
  /** Düello kurma (15 Kasım 2026, Burhan onayı): ~iki konu testi; rövanş ve oynama yeni üretim yapmaz. Göç 20261115140000. */
  DUEL_GENERATE: { credits: 20, per: "düello" },
  /** Faz 4: 4 → 8 (ilk 8 kart). Kayıtlı deste yeniden açılınca 0. */
  FLASHCARD_GENERATE: { credits: 8, per: "8 kartlık deste" },
  /** Faz 4: 15 → 17; başlangıçta tek atomik ücret, notlandırma ve karne dahil. */
  PRACTICE_EXAM_GENERATE: { credits: 17, per: "deneme (notlandırma dahil)" },
  PRACTICE_EXAM_GRADE: { credits: 0, per: "değerlendirme" },
  /** Faz 4: 30 → 22. */
  STUDY_PLAN_GENERATE: { credits: 22, per: "ders" },
  /** Faz 4: 12 → 16. */
  PODCAST_GENERATE: { credits: 16, per: "podcast" },
  /** Faz 4: 6 → 3. */
  ORAL_EXAM_GENERATE: { credits: 3, per: "sözlü deneme" },
  /**
   * Video ders (17 Ekim 2026): 6-8 sahne resmi + ~1 dk seslendirme + senaryo. Resimler
   * işin büyük kısmı (kıyas ürünü: "Aylık limitinden daha fazlasını kullanır"); yalnız Plus.
   */
  VIDEO_GENERATE: { credits: 280, per: "video ders" },
  /** Çizimli özet resim modeli çağırmaz; senaryo + şema + ses (27 Ekim 2026). Faz 4: 25 → 22. */
  SKETCH_VIDEO_GENERATE: { credits: 22, per: "çizimli video" },
  EXPORT_PDF: { credits: 0, per: "dışa aktarma" },
  /** 19 Ekim 2026: 2 → 15 (ölçülen maliyet 900 karakter ≈ $0,015; göç 20261019130000). */
  AUDIO_SYNTHESIZE: { credits: 15, per: "900 karakter" },
  /** Havuz içeriği (2 Kasım 2026, ürün sahibinin kararı): model çağrısı yok, ücretsiz. */
  POOL_LESSON_VIEW: { credits: 0, per: "hazır ders" },
  POOL_CARDS: { credits: 0, per: "hazır kart seti" },
  POOL_QUIZ: { credits: 0, per: "hazır test" },
  /** Öğrencinin belgesinden ünite ek bölümü (model çağrılırsa; aynı ek yeniden ücretlenmez). */
  DOCUMENT_SUPPLEMENT_GENERATE: { credits: 15, per: "ünite eki" },
  /** Faz 4: doğru/yanlış testten ayrı (önce test fiyatı 10). */
  TRUE_FALSE_GENERATE: { credits: 3, per: "doğru/yanlış" },
  /** Faz 4: "Farklı anlat" (önce sohbet mesajı fiyatı 3); adım başına önbellek, aynı anlatım yeniden ücretlenmez. */
  STEP_REEXPLAIN: { credits: 4, per: "farklı anlatım" },
  /**
   * Canlı sesli öğretmen (21 Kasım 2026, Burhan'ın kararı): `gpt-realtime-2.1-mini` ile karşılıklı konuşma. Her dakikanın
   * kredisi dakika başında ayrılır; dakikanın ilk 5 saniyesi geçtiyse dakika ödenir, geçmeden biterse iade
   * (`src/lib/tutor/realtime/billing.ts`). Göç 20261121170000_realtime_voice_minute. Ücretsiz hesapta kredi düşmez:
   * hesap başına bir kez 1 dakikalık deneme, sonrası Plus.
   */
  REALTIME_VOICE_MINUTE: { credits: 60, per: "dakika" },
};

/** Faz 4: kaç metin sayfası bir kredi eder (metin PDF / DOCX / PPTX). */
export const TEXT_PAGES_PER_CREDIT = 5;

/**
 * Faz 4 belge yükleme bedeli (yalnız ilk yükleme, bir kez): metin sayfaları ceil(n / 5), fotoğraf ya da taranmış
 * (Vision OCR) sayfa başına 5. Örnek (spesifikasyon): 25 sayfalık metin PDF = 5; 300 sayfa PDF + 50 slayt + 10 fotoğraf
 * = ceil(350 / 5) + 10 × 5 = 70 + 50 = 120.
 */
export function documentUploadCredits(input: { textPages: number; photoPages: number }): number {
  const text = Math.max(0, Math.floor(input.textPages || 0));
  const photo = Math.max(0, Math.floor(input.photoPages || 0));
  return textPageCredits(text) + photo * CREDIT_PRICE_TABLE.DOCUMENT_SCAN_PAGE.credits;
}

/** Metin sayfalarının kredi miktarı (`DOCUMENT_PAGE_PROCESS` adedi): ceil(n / 5). */
export function textPageCredits(textPages: number): number {
  const pages = Math.max(0, Math.floor(textPages || 0));
  return Math.ceil(pages / TEXT_PAGES_PER_CREDIT) * CREDIT_PRICE_TABLE.DOCUMENT_PAGE_PROCESS.credits;
}

/** `DOCUMENT_PAGE_PROCESS` ayırma adedi: ceil(metin sayfası / 5) birim. */
export function textPageUnits(textPages: number): number {
  return Math.ceil(Math.max(0, Math.floor(textPages || 0)) / TEXT_PAGES_PER_CREDIT);
}

/** Çalışma zamanındaki tek eylem kodu listesi; tip (`Record<ActionCode, …>`) eksiksizliği zaten zorlar. */
export const ACTION_CODES = Object.keys(CREDIT_PRICE_TABLE) as readonly ActionCode[];

/**
 * Koddan eklenen kuralın açıklaması. `/admin/sistem` bu önekle başlayan satırı "göç ve kayıt satırı
 * yazılmalı" uyarısıyla gösterir; göç gelince `ON CONFLICT … DO UPDATE` açıklamayı kendi metniyle ezer.
 */
export const CODE_SEEDED_RULE_NOTE = "Koddan eklendi (fiyat tablosu): ilgili göç canlıda yoktu";

/** `credit_rules`'a yalnız EKSİK satır olarak girecek tohum; var olan satır buna göre güncellenmez. */
export function creditRuleSeed(code: ActionCode): {
  action_code: ActionCode;
  credit_cost: number;
  model_tier: "standard";
  description: string;
  active: true;
} {
  return {
    action_code: code,
    credit_cost: CREDIT_PRICE_TABLE[code].credits,
    model_tier: "standard",
    description: CODE_SEEDED_RULE_NOTE,
    active: true,
  };
}

export const AUDIO_CHARS_PER_CREDIT_PRICE = 900;

/** Plus dahil sohbet mesajı ücretlidir. */
export const PLUS_CHAT_IS_FREE = false;

/**
 * Dönem hakları (kredi). Haftalık plan haftalık, diğerleri aylık. Ücretsiz hesabın kredisi yok (24 Ekim 2026):
 * ilk ders, günde 3 mesaj, ayda 7 fotoğraf sayaçla (`free-meters.ts`). Yıllık planlar satıştan kalktı; satır elinde
 * yıllık abonelik olan için duruyor.
 *
 * Faz 4 (19 Kasım 2026, Burhan'ın kararı; fiyatlar aynı): Sınav Haftası 2.700 → 2.500, Plus 7.200 → 4.350,
 * Sigma 60.000 → 14.500. Kaynak `plans.monthly_allowance` (göç 20261119120000); eski abonelerin eldeki hakkı
 * `current_period_end`'e kadar aynen kalır, yeni hak yalnız yeni abonelikte ve yenilemede yazılır (`credit_reserve`
 * dönem bitince plandan okur).
 */
export const PLAN_ALLOWANCES = {
  free: 0,
  plusWeekly: 2500,
  plusMonthly: 4350,
  plusYearly: 4350,
  sigmaMonthly: 14500,
  sigmaYearly: 14500,
} as const;

/** Ek paketler (Faz 4: 1.000 / 2.500 / 5.750 → 900 / 2.350 / 5.400; fiyatlar aynı). */
export const ADDON_PACKS = [
  { slug: "ek-kredi-50", credits: 900, priceTry: 129 },
  { slug: "ek-kredi-150", credits: 2350, priceTry: 329 },
  { slug: "ek-kredi-400", credits: 5400, priceTry: 749 },
] as const;

/** Bir hakkın somut karşılığı: "ayda yaklaşık 4.350 mesaj ya da 197 ders". */
export function allowanceInWork(allowance: number): { messages: number; lessons: number } {
  return {
    messages: Math.floor(allowance / CREDIT_PRICE_TABLE.AI_CHAT_STANDARD.credits),
    lessons: Math.floor(allowance / CREDIT_PRICE_TABLE.STUDY_PLAN_GENERATE.credits),
  };
}

/** Kalan krediyle yapılabilecek iş (/ayarlar "Kalan Çalışma Kapasiten"): floor(kalan/22) ders, floor(kalan/14) test, kalan sohbet. */
export function remainingCapacity(remaining: number): { lessons: number; tests: number; chats: number } {
  const left = Math.max(0, Math.floor(Number.isFinite(remaining) ? remaining : 0));
  return {
    lessons: Math.floor(left / CREDIT_PRICE_TABLE.STUDY_PLAN_GENERATE.credits),
    tests: Math.floor(left / CREDIT_PRICE_TABLE.QUIZ_GENERATE.credits),
    chats: Math.floor(left / CREDIT_PRICE_TABLE.AI_CHAT_STANDARD.credits),
  };
}

/**
 * Plan kartındaki karşılık (Faz 4 metni): "~200 ders / 310 test / 4.350 sohbet". Ders sayısı yaklaşık (en yakın 5'e),
 * test ve sohbet tam (aşağı yuvarlanmış) sayıdır; üçü de krediden ve fiyat tablosundan hesaplanır.
 */
export function planWorkEquivalent(allowance: number): { lessons: number; tests: number; chats: number } {
  const exactLessons = allowance / CREDIT_PRICE_TABLE.STUDY_PLAN_GENERATE.credits;
  return {
    lessons: Math.round(exactLessons / 5) * 5,
    tests: Math.floor(allowance / CREDIT_PRICE_TABLE.QUIZ_GENERATE.credits),
    chats: Math.floor(allowance / CREDIT_PRICE_TABLE.AI_CHAT_STANDARD.credits),
  };
}

/** "~200 ders / 310 test / 4.350 sohbet" */
export function planWorkLine(allowance: number): string {
  const work = planWorkEquivalent(allowance);
  const tr = (value: number) => value.toLocaleString("tr-TR");
  return `~${tr(work.lessons)} ders / ${tr(work.tests)} test / ${tr(work.chats)} sohbet`;
}

/** /fiyatlandirma ve /pay garanti bandı (Faz 4 metni, harfiyen). */
export const FREE_RESTUDY_BAND = "Ürettiğin yolu 5 kere de 50 kere de baştan çözsen 0 kredi (%100 ücretsiz tekrar)";
