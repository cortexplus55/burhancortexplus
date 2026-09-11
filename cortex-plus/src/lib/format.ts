export function formatTry(kurus: number) {
  return new Intl.NumberFormat("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 2,
  }).format(kurus / 100);
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
