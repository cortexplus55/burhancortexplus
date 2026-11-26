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
 * kvkk_aydinlatma    src/lib/legal/kvkk-text.ts   — 26 Kasım 2026 (mobil uygulama: bildirim anahtarı, Apple/Google, RevenueCat,
 *                    giriş yapmadan silme); 8 Kasım (IP); 7 Kasım (çocuk özeti, tedarikçiler, saklama, başvuru);
 *                    15 Kasım 2026 metin açıklamasıydı, onay sürümü değişmemişti (`KVKK_NON_MATERIAL_REVISIONS`)
 * kullanim_kosullari src/lib/legal/terms-text.ts  — 26 Kasım 2026 (mağaza aboneliği, Bildir, silme yolu); 21 Kasım (ücretsiz
 *                    hesabın kapsamı); 7 Kasım (yaş ve veli izni, yüklenen içerik, sıralama)
 */
export const LEGAL_VERSIONS = {
  // 26 Kasım 2026 (mağaza uyumluluğu): yeni alıcılar (Apple, Google bildirim ve mağaza, RevenueCat) ve yeni veri
  // (bildirim cihaz anahtarı): KVKK'ya göre esaslı değişiklik, yeniden onay istenir.
  kvkk_aydinlatma: "2026-11-26",
  // 26 Kasım 2026: web satışı ile mobil uygulamadaki mağaza aboneliği ayrı yazıldı (otomatik yenileme, 24 saat, iptal,
  // iade), "Bildir" ve yapay zekâ içeriğinin tavsiye yerine geçmediği, giriş yapmadan silme yolu eklendi.
  kullanim_kosullari: "2026-11-26",
} as const;

export type ConsentType = keyof typeof LEGAL_VERSIONS;

/**
 * Aydınlatma metninin içeriğinin en son değiştiği gün (sayfada "son güncelleme"). Onay sürümünden yeni olabilir: yeni
 * bir veri, amaç, alıcı ya da hukuki sebep EKLEMEYEN, yalnız var olan bir işlemeyi açıkça yazan değişiklik yeniden onay
 * istemez (aydınlatma bir onay değil, bilgilendirmedir). Böyle her değişiklik `KVKK_NON_MATERIAL_REVISIONS`'ta
 * gerekçesiyle durur; bekçi (`uyum-paketi.test.ts`) metnin özetini bu tarihle tutar, gerekçesiz değişiklikte düşer.
 * Onay kaydı öğrencinin onay zamanını da taşır: "o gün ne yazıyordu" sorusu tarihle git geçmişinden cevaplanır.
 */
export const KVKK_TEXT_DATE: string = "2026-11-26";

// 26 Kasım 2026: onay sürümü 2026-11-26'ya yükseldi; 15 Kasım'ın gerekçeli açıklaması (kişiye özel anlatım ve eksik
// analizi, m.5/2-c) artık onaylanan metnin parçası, liste boşaldı (git geçmişinde duruyor).
export const KVKK_NON_MATERIAL_REVISIONS: Record<string, string> = {};

/** Kayıtta istenen yaş beyanı (18 altı / üstü) ve 18 altındaysa velinin izin beyanı. */
export const AGE_DECLARATION = { type: "yas_beyani", version: "2026-11-07" } as const;

/**
 * Ödeme sözleşmeleri (Ön Bilgilendirme Formu + Mesafeli Satış Sözleşmesi) için "okudum" kaydı. Her satın almada
 * kutu yine işaretlenir (her satın alma ayrı sözleşme); bu sürümü daha önce sonuna kadar okumuş öğrenciye metin
 * zorla yeniden açtırılmaz. Metin `src/lib/legal/texts.ts`.
 */
// 19 Kasım 2026 (Faz 5 §4): "Hizmetin konusu" maddesinin kota cümlesi tek merkezden (`plan-copy.ts`);
// ücretsiz hesaptaki eski haftalık sınır cümlesi kalktı, üç planın karşılığı eklendi.
export const SALES_DOCS = { type: "satis_sozlesmeleri", version: "2026-11-19" } as const;

/** Çerez politikası (`cookie-text.ts`). Değişince tercih yeniden sorulur. */
export const COOKIE_POLICY_VERSION = "2026-11-07";

/** Onay kapısında gösterilen "ne değişti" notu. Sürüm değişince bu cümle de değişir. */
export const LEGAL_CHANGE_NOTES: Record<ConsentType, string> = {
  kvkk_aydinlatma:
    "Mobil uygulama için bildirim cihaz anahtarı, canlı sesli öğretmen, Apple ve Google'ın bildirim ve mağaza hizmetleri ile mağaza aboneliğini hesabına tanımlayan RevenueCat eklendi; hesabını giriş yapmadan silme yolu yazıldı.",
  kullanim_kosullari:
    "Web sitesindeki satış ile mobil uygulamadaki mağaza aboneliği ayrı yazıldı (mağaza aboneliği iptal edilmezse yenilenir, iptal ve iade mağazadan); öğretmen yanıtını bildirme yolu ve giriş yapmadan hesap silme eklendi.",
};

export function consentKey(type: string, version: string): string {
  return `${type}@${version}`;
}

/** Bugün istenen onayların kimliği: önbellek ve onay kapısı bununla karşılaştırır. */
export const REQUIRED_CONSENT_KEY = [
  ...Object.entries(LEGAL_VERSIONS).map(([type, version]) => consentKey(type, version)),
  consentKey(AGE_DECLARATION.type, AGE_DECLARATION.version),
].join("|");
