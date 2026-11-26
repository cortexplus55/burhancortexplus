/**
 * Yapay zekâ şeffaflık notu (26 Kasım 2026, mağaza uyumluluğu: App Store 1.4.1 ve 5.1.1, Google Play yapay zekâ içerik
 * politikası). Ders ve öğretmen ekranlarında sade tek cümle: içerik yapay zekâ desteklidir, hata yapabilir, resmî sınav
 * kılavuzunun, tıbbi ya da hukuki tavsiyenin yerine geçmez. Kullanım Koşulları'ndaki "Yapay zekâ içerikleri" maddesiyle
 * aynı kuralı söyler.
 */
export const AI_NOTICE = {
  teacher:
    "Cortex Plus öğretmeni yapay zekâyla yanıt verir ve yanılabilir; resmî sınav kılavuzunun, tıbbi ya da hukuki tavsiyenin yerine geçmez. Hatalı ya da uygunsuz bir yanıtı altındaki «Bildir» ile iletebilirsin.",
  lesson:
    "Bu ders yapay zekâ desteğiyle hazırlandı ve hata içerebilir; resmî sınav kılavuzunun, tıbbi ya da hukuki tavsiyenin yerine geçmez.",
} as const;

export type AiNoticeKind = keyof typeof AI_NOTICE;
