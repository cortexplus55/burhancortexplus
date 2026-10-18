import { SELLER } from "@/lib/legal/seller";

/**
 * Destek cevap süresi sözü — tek kaynak (plan 4.9, ürün sahibinin kararı 19 Ekim 2026):
 * hafta içi 24 saat, hafta sonu 48 saat; sorumlu adres operasyon e-postası. Süreyi
 * değiştirirken yalnız burayı değiştirin; destek sayfası ve bekçi test buradan okur.
 */
export const SUPPORT_SLA = {
  weekdayHours: 24,
  weekendHours: 48,
  email: SELLER.email,
} as const;

export function supportSlaLine(sla = SUPPORT_SLA): string {
  return `Hafta içi ${sla.weekdayHours} saat, hafta sonu ${sla.weekendHours} saat içinde ${sla.email} adresinden cevap veririz.`;
}
