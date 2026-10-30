/**
 * Kısa gün etiketleri (30 Ekim 2026, Paket I). Yol (`path-dates.ts`), Takvimim ve sınav saati aynı
 * biçimi yazsın diye tek yerde; ağır modül içe aktarmaz (Takvimim istemcisi de okuyor).
 */

export const SHORT_MONTHS = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"] as const;

/** ISO hafta günü 1=Pzt … 7=Paz. */
export const SHORT_WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"] as const;

/** "2026-10-30" → "30 Eki". */
export function shortDayLabel(iso: string): string {
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  const name = SHORT_MONTHS[month - 1] ?? "";
  return `${day} ${name}`;
}

/** "2026-10-30" → "Cum 30 Eki". */
export function weekdayDayLabel(iso: string): string {
  const js = new Date(`${iso}T00:00:00Z`).getUTCDay();
  const weekday = SHORT_WEEKDAYS[(js + 6) % 7] ?? "";
  return `${weekday} ${shortDayLabel(iso)}`;
}

/** "2026-10-29" → "Tamamlandı · 29 Eki"; günü bilinmiyorsa yalnız "Tamamlandı". */
export function doneDayLabel(iso: string | null | undefined): string {
  return typeof iso === "string" && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `Tamamlandı · ${shortDayLabel(iso)}` : "Tamamlandı";
}
