import { formatNumber } from "@/lib/format";

/** Yönetici çipi. Sayı ve satın alma çağrısı yok. */
export const FOUNDER_CREDIT_LABEL = "Kurucu · Sınırsız";

/**
 * Üst çubuk metni.
 * Yönetici sınırsız görünür. Diğer hesaplar bugünkü çipin aynısı: plan ve bakiye.
 */
export function creditChipLabel(account: {
  isAdmin?: boolean;
  planLabel?: string | null;
  balance: number;
}): string {
  if (account.isAdmin) return FOUNDER_CREDIT_LABEL;
  const plan = account.planLabel || "Plus";
  const balance = Number.isFinite(account.balance) ? account.balance : 0;
  return `${plan} · ${formatNumber(balance)} kr`;
}
