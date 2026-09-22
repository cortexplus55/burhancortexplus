/**
 * Türkiye yerel fiyat biçimlendirme — tek kaynak.
 *
 * Veritabanındaki `*_try` kolonları KURUŞ tutar (59900 → ₺599,00).
 * PayTR charge da kuruş alır; iade API'si ise TRY (lira) string ister.
 */

/** Kuruşu `₺599,00` biçiminde gösterir. */
export function formatTry(kurus: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(kurus / 100);
}

/** Kuruşu tam lira (kuruşsuz) gösterir: `₺599`. */
export function formatTryWhole(kurus: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0,
  }).format(kurus / 100);
}

/** Kuruş → lira sayı (gösterim / PayTR iade için). */
export function kurusToTry(kurus: number): number {
  return kurus / 100;
}

/** Lira → kuruş (admin paket düzenleyici girişi). */
export function tryToKurus(lira: number): number {
  return Math.round(lira * 100);
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  // Saat dilimi sabit: etiketlerin çoğu sunucuda üretiliyor ve sunucu
  // UTC'de. Sabitlenmezse öğrenciye kendi saatinden üç saat geride bir
  // zaman gösteriliyor.
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatDateShort(value: string | Date | null | undefined) {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul",
    dateStyle: "medium",
  }).format(date);
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("tr-TR").format(value);
}
