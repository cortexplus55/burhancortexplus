/** İkiz soru ve iki şık ipucunun ekran metinleri (31 Ekim 2026, Paket J3 #12); istemci de okur, sunucu modülü değil. */

export const TWIN_STARS = 5;
/** Faz 5 §3.1 (19 Kasım 2026, harfiyen): yanlış cevabın açıklamasının hemen altında. */
export const TWIN_BUTTON = "🔥 Yanlışın İkiziyle Anında Telafi Et";
export const TWIN_RIGHT = `👏 İkiz soruyu çözdün! +${TWIN_STARS} ⭐`;
export const TWIN_RIGHT_AGAIN = "👏 Doğru! Bu ikizin yıldızını daha önce almıştın.";
export const TWIN_WRONG = "Bu sefer de olmadı; açıklamayı oku, sonra devam et.";
export const TWIN_UNAVAILABLE = "İkiz soru şu an hazırlanamadı. Birazdan yeniden dene.";
/** Faz 5 §3.1 (harfiyen): cevap vermeden önce, şıkların altında. */
export const TWO_OPTION_CHIP = "🤔 İki Şık Arasında Kaldım";
export const TWO_OPTION_PICK = "Arasında kaldığın iki şıkka dokun.";
/** Soru başına bir ipucu (20 Kasım 2026): kullanıldıktan sonra düğme bu yazıyla kapalı kalır. */
export const TWO_OPTION_USED = "İpucu kullanıldı";
/** İpucu üretilemezse ekranın söylediği sabit cümle (cevap içermez). */
export const TWO_OPTION_FALLBACK = "İki şıkkı tanımlarıyla karşılaştır: soru kökündeki anahtar ifade hangisinin tanımına uyuyor?";

/** İpucuyla birlikte elenen çeldirici (Faz 5 §3.1): seçilen iki şıkkın dışında, doğru olmayan bir şık. */
export function twoOptionEliminatedLine(letter: string): string {
  return `❌ ${letter} şıkkı çeldirici olarak elendi.`;
}
