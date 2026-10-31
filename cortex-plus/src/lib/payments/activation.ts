/**
 * Ödeme dönüşünde Plus tanımlandı mı (31 Ekim 2026).
 *
 * PayTR öğrenciyi `/odeme/basarili`ye hemen döndürüyor; Plus'ı asıl açan sunucu bildirimi
 * (`/api/payments/paytr/callback` → `finalize_paytr_payment`) ise 5-15 sn sonra gelebiliyor. O arada
 * öğrenci uygulamada "Ücretsiz" görüp paniğe kapılıyordu. Sayfa artık durumu yokluyor; karar bu
 * dosyada, istemci bileşeninden ayrı (sunucu sayfası `"use client"` modülünden fonksiyon çağırmaz).
 */

/** Yoklama aralığı: bildirim gelir gelmez görünsün, ama sunucuyu sele boğmasın. */
export const ACTIVATION_POLL_INTERVAL_MS = 1500;
/** Bu kadar beklenir; sonra sakin "banka onayı biraz uzadı" ekranı. Ödeme asla "başarısız" denmez. */
export const ACTIVATION_POLL_WINDOW_MS = 20_000;
/** Tek yoklama isteği takılırsa bırakılır, sıradaki dener. */
export const ACTIVATION_REQUEST_TIMEOUT_MS = 5000;
/** Kutlama görünsün diye uygulamaya geçmeden önceki kısa bekleme. */
export const ACTIVATION_REDIRECT_MS = 2600;
/**
 * "Bu ödeme" penceresi: ödeme satırı iFrame açılırken yazılıyor, PayTR oturumu kısa. Daha eski
 * satırlar (geçen ayın ödemesi) bu dönüşün kanıtı sayılmaz.
 */
export const RECENT_PAYMENT_WINDOW_MS = 2 * 60 * 60 * 1000;
/**
 * Öğrencinin uygulamadaki ana sayfası. `homePathForRole` `/dashboard` döner, o da `/ogretmen`e
 * yönlendirir; ödeme sonrası fazladan bir yönlendirme turu beklenmesin diye doğrudan hedef.
 */
export const APP_HOME_PATH = "/ogretmen";
export const ACTIVATION_RETURN_PATH = "/odeme/basarili";

export type PaymentRowStatus = "pending" | "paid" | "failed" | "refunded";

/** `GET /api/payments/status` cevabı. Kredi sayısı yok: öğrenci kredi görmez. */
export type ActivationStatus = {
  /** Plus ya da Sigma şu an açık mı (`getUserEntitlements`). */
  plus: boolean;
  plan: string | null;
  badge: "Plus" | "Sigma" | null;
  /** Son iki saatte başlatılan ödemelerin özeti; hiç yoksa `null`. */
  payment: { status: PaymentRowStatus } | null;
};

type PaymentRow = { status?: string | null; created_at?: string | null };

function asStatus(value: string | null | undefined): PaymentRowStatus {
  return value === "paid" || value === "failed" || value === "refunded" ? value : "pending";
}

/**
 * Son iki saatin ödemeleri tek duruma iner. Biri ödendiyse "paid": öğrenci iki ödeme penceresi açıp
 * birinde ödediyse en yeni satır hâlâ "pending" olabilir; o yüzden yalnız en yeniye bakılmaz.
 */
export function recentPaymentStatus(
  rows: readonly PaymentRow[] | null | undefined,
  nowMs: number,
): ActivationStatus["payment"] {
  const since = nowMs - RECENT_PAYMENT_WINDOW_MS;
  const recent = (rows ?? [])
    .filter((row) => {
      const at = row.created_at ? Date.parse(row.created_at) : Number.NaN;
      return Number.isFinite(at) && at >= since;
    })
    .sort((a, b) => Date.parse(b.created_at ?? "") - Date.parse(a.created_at ?? ""));
  if (recent.length === 0) return null;
  if (recent.some((row) => row.status === "paid")) return { status: "paid" };
  return { status: asStatus(recent[0].status) };
}

/**
 * Plus tanımlandı mı. Asıl kanıt ödeme satırının "paid" olması: bildirim satırı ve aboneliği aynı
 * işlemde yazıyor. Yalnız "Plus açık mı"ya bakmak iki yerde yanılırdı: süresi bitmemiş Plus'ını erken
 * uzatan öğrenci bildirim gelmeden "hazır" görürdü; kurucunun "Ücretsiz gibi gör" önizlemesi ise
 * ödeme geçse de hep ücretsiz okurdu. Son iki saatte ödeme yoksa (sayfa doğrudan açıldı) plan
 * belirler. Çocuğu için ödeyen hesapta yalnız ödeme satırı: Plus o hesaba değil öğrenciye açılır.
 */
export function isPlusActivated(
  status: Pick<ActivationStatus, "plus" | "payment"> | null | undefined,
  options: { forChild?: boolean } = {},
): boolean {
  if (!status) return false;
  if (status.payment?.status === "paid") return true;
  if (options.forChild) return false;
  return status.payment === null && status.plus === true;
}

/** Oturumu düşen öğrencinin giriş bağlantısı: girişten sonra aynı ekrana döner. */
export function activationLoginHref(returnPath: string = ACTIVATION_RETURN_PATH): string {
  return `/giris?next=${encodeURIComponent(returnPath)}`;
}
