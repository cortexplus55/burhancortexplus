/**
 * Kayıtta onaylanan metinlerin sürümü: metnin içeriğinin en son değiştiği
 * gün. `consent_records` öğrencinin HANGİ metne onay verdiğini bu değerle
 * saklıyor; bir itirazda "o gün sözleşmede ne yazıyordu" sorusunun cevabı
 * git geçmişinde bu tarihteki metin.
 *
 * Metin değişince tarih de değişmeli. Değişmezse yeni metne verilen onay
 * eski sürüm adıyla kaydedilir ve kayıt kanıt değerini yitirir.
 *
 * kvkk_aydinlatma    src/app/kvkk/page.tsx               — 27 Ağustos 2026 (iletişim adresi)
 * kullanim_kosullari src/app/kullanim-kosullari/page.tsx — 28 Eylül 2026 (otomatik yenileme yok)
 */
export const LEGAL_VERSIONS = {
  kvkk_aydinlatma: "2026-08-27",
  kullanim_kosullari: "2026-09-28",
} as const;

export type ConsentType = keyof typeof LEGAL_VERSIONS;
