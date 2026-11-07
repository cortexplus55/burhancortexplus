/**
 * Onaylanan metinlerin sürümü: metnin içeriğinin en son değiştiği gün. `consent_records` öğrencinin HANGİ metne
 * onay verdiğini bu değerle saklıyor; bir itirazda "o gün metinde ne yazıyordu" sorusunun cevabı git geçmişinde
 * bu tarihteki metin.
 *
 * Metin değişince tarih de değişmeli. Değişmezse yeni metne verilen onay eski sürüm adıyla kaydedilir ve kayıt
 * kanıt değerini yitirir. Bekçi: `tests/unit/uyum-paketi.test.ts` metnin özetini sürümle birlikte tutar; metin
 * değişip sürüm değişmezse test düşer.
 *
 * Sürüm değişince öğrenci bir sonraki girişinde yeni metni görür ve yeniden onaylar (onay kapısı,
 * `consent-gate.tsx`); aynı sürümü onaylamış öğrenciye bir daha sorulmaz.
 *
 * kvkk_aydinlatma    src/lib/legal/kvkk-text.ts   — 8 Kasım 2026 (IP'nin hangi kayıtta nasıl tutulduğu düzeltildi; 7 Kasım: çocuk özeti, tedarikçiler, saklama, başvuru)
 * kullanim_kosullari src/lib/legal/terms-text.ts  — 7 Kasım 2026 (yaş ve veli izni, yüklenen içerik, sıralama)
 */
export const LEGAL_VERSIONS = {
  kvkk_aydinlatma: "2026-11-08",
  kullanim_kosullari: "2026-11-07",
} as const;

export type ConsentType = keyof typeof LEGAL_VERSIONS;

/** Kayıtta istenen yaş beyanı (18 altı / üstü) ve 18 altındaysa velinin izin beyanı. */
export const AGE_DECLARATION = { type: "yas_beyani", version: "2026-11-07" } as const;

/**
 * Ödeme sözleşmeleri (Ön Bilgilendirme Formu + Mesafeli Satış Sözleşmesi) için "okudum" kaydı. Her satın almada
 * kutu yine işaretlenir (her satın alma ayrı sözleşme); bu sürümü daha önce sonuna kadar okumuş öğrenciye metin
 * zorla yeniden açtırılmaz. Metin `src/lib/legal/texts.ts`.
 */
export const SALES_DOCS = { type: "satis_sozlesmeleri", version: "2026-11-07" } as const;

/** Çerez politikası (`cookie-text.ts`). Değişince tercih yeniden sorulur. */
export const COOKIE_POLICY_VERSION = "2026-11-07";

/** Onay kapısında gösterilen "ne değişti" notu. Sürüm değişince bu cümle de değişir. */
export const LEGAL_CHANGE_NOTES: Record<ConsentType, string> = {
  kvkk_aydinlatma:
    "Çocuklar için kısa bir özet, hizmet aldığımız şirketlerin listesi, saklama süreleri ve başvuru yolları eklendi; IP adresinin hangi kayıtta nasıl tutulduğu netleştirildi.",
  kullanim_kosullari:
    "18 yaşından küçükler için veli izni, yüklediğin içerik, sıralamada görünürlük ve metin değişikliklerinin nasıl bildirildiği eklendi.",
};

export function consentKey(type: string, version: string): string {
  return `${type}@${version}`;
}

/** Bugün istenen onayların kimliği: önbellek ve onay kapısı bununla karşılaştırır. */
export const REQUIRED_CONSENT_KEY = [
  ...Object.entries(LEGAL_VERSIONS).map(([type, version]) => consentKey(type, version)),
  consentKey(AGE_DECLARATION.type, AGE_DECLARATION.version),
].join("|");
