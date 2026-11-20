/**
 * "🚩 Soruda Hata Bildir" (31 Ekim 2026, Paket J2 #10) — öğrencinin gördüğü metinler ve ödül sayıları tek yerde.
 *
 * Ödülün kredi sayısı ürün sahibinin isteğiyle ekranda yazılı ("+15 Hediye Kredi"); öğrenciye kredi sayısı
 * gösterilmez kuralının bilinçli istisnası.
 */

/**
 * Faz 5 §3.1 (19 Kasım 2026, harfiyen): modalda üç neden. Eski nedenler (`LEGACY_REPORT_REASONS`) yalnız eski
 * kayıtların adı ve eski istemcilerin isteği için tanınır; ekranda gösterilmez.
 */
export const REPORT_REASONS = [
  { id: "key", label: "Cevap anahtarı hatalı" },
  { id: "stem", label: "Soru kökü eksik" },
  { id: "render", label: "Görsel-formül bozuk" },
] as const;

export const LEGACY_REPORT_REASONS = [
  { id: "options", label: "Birden fazla doğru var ya da hiçbiri doğru değil" },
  { id: "broken", label: "Soru eksik ya da anlaşılmıyor" },
  { id: "typo", label: "Yazım hatası" },
  { id: "other", label: "Başka bir şey" },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]["id"] | (typeof LEGACY_REPORT_REASONS)[number]["id"];

/** Sunucunun kabul ettiği bütün nedenler (yeni üçü + eski istemciler). */
export const REPORT_REASON_IDS = [...REPORT_REASONS, ...LEGACY_REPORT_REASONS].map((reason) => reason.id) as [
  ReportReason,
  ...ReportReason[],
];

export function reportReasonLabel(reason: ReportReason): string {
  return [...REPORT_REASONS, ...LEGACY_REPORT_REASONS].find((item) => item.id === reason)?.label ?? "Başka bir şey";
}

export const REPORT_GIFT_CREDITS = 15;
export const REPORT_STARS = 20;
/** Bir öğrenci günde (İstanbul günü) en çok bu kadar bildirim için ödül alır. */
export const REPORT_DAILY_REWARD_CAP = 3;

export const REPORT_BUTTON = "🚩 Soruda Hata Bildir";
/** Tanıtım turunda (`/ornek`, misafir de olabilir) bildirim model denetimine gitmez; ekip inceler. */
export const REPORT_DEMO_THANKS = "👏 Teşekkürler! Bildirimin kaydedildi; ekibimiz bu soruyu inceleyecek.";
/** Cevap vermeden önce gelen bildirim: anahtar ve açıklama cevaplanana kadar gösterilmez. */
export const REPORT_BEFORE_ANSWER = "Teşekkürler, bildirimin alındı ve soru kontrol edildi. Cevabını verince açıklamayı görürsün.";
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
