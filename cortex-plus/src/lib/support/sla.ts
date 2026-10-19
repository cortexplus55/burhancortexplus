import { SELLER } from "@/lib/legal/seller";

/**
 * Destek cevap süresi sözü — tek kaynak (plan 4.9). Ürün sahibinin kararı (19 Ekim 2026, ikinci kez
 * soruldu): **24 saat içinde**, hafta sonu dahil (önceki taslakta hafta sonu 48 saatti). Sorumlu adres
 * operasyon e-postası. Günlük özet 24 saati geçen açık talepleri sayar (`daily-digest.ts`). Süreyi
 * değiştirirken yalnız burayı değiştirin; destek sayfası, özet ve bekçi test buradan okur.
 */
export const SUPPORT_SLA = {
  hours: 24,
  email: SELLER.email,
} as const;

export function supportSlaLine(sla: { hours: number; email: string } = SUPPORT_SLA): string {
  return `${sla.hours} saat içinde ${sla.email} adresinden cevap veririz.`;
}
