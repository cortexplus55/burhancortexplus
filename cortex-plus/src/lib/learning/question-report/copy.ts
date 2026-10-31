/**
 * "🚩 Soruda hata bildir" (31 Ekim 2026, Paket J2 #10) — öğrencinin gördüğü metinler ve ödül sayıları tek yerde.
 *
 * Ödülün kredi sayısı ürün sahibinin isteğiyle ekranda yazılı ("+15 Hediye Kredi"); öğrenciye kredi sayısı
 * gösterilmez kuralının bilinçli istisnası.
 */

export const REPORT_REASONS = [
  { id: "key", label: "Cevap anahtarı yanlış" },
  { id: "options", label: "Birden fazla doğru var ya da hiçbiri doğru değil" },
  { id: "broken", label: "Soru eksik ya da anlaşılmıyor" },
  { id: "typo", label: "Yazım hatası" },
  { id: "other", label: "Başka bir şey" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["id"];

export const REPORT_REASON_IDS = REPORT_REASONS.map((reason) => reason.id) as [ReportReason, ...ReportReason[]];

export function reportReasonLabel(reason: ReportReason): string {
  return REPORT_REASONS.find((item) => item.id === reason)?.label ?? "Başka bir şey";
}

export const REPORT_GIFT_CREDITS = 15;
export const REPORT_STARS = 20;
/** Bir öğrenci günde (İstanbul günü) en çok bu kadar bildirim için ödül alır. */
export const REPORT_DAILY_REWARD_CAP = 3;

export const REPORT_BUTTON = "🚩 Soruda hata bildir";
export const REPORT_THANKS =
  `👏 Dikkatli gözün için teşekkürler! Hatayı yakaladığın için hesabına +${REPORT_GIFT_CREDITS} Hediye Kredi ve +${REPORT_STARS} Yıldız tanımlandı`;
export const REPORT_THANKS_CAPPED =
  "👏 Dikkatli gözün için teşekkürler! Soruyu düzelttik. Bugünkü ödül hakkın doldu; yarın yine ödül alabilirsin.";
export const REPORT_REJECTED = "Teşekkürler, soruyu yeniden kontrol ettik: soru ve cevap anahtarı doğru görünüyor.";
export const REPORT_ALREADY = "Bu soruyu zaten bildirdin; kontrol edildi.";
export const REPORT_UNAVAILABLE = "Soruyu şu an kontrol edemedik. Birazdan yeniden dene.";

/** Düzeltilen ya da geçersiz sayılan sorunun altında. */
export const VOIDED_FIXED_LINE = "✅ Bu sorunun cevap anahtarı düzeltildi; soru sana tam puan olarak sayıldı.";
export const VOIDED_LINE = "✅ Bu soru hatalı bulundu ve geçersiz sayıldı; sana tam puan olarak sayıldı.";
