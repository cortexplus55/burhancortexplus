import { formatNumber } from "@/lib/format";

/** Yönetici çipi. Sayı ve satın alma çağrısı yok. */
export const FOUNDER_CREDIT_LABEL = "Kurucu · Sınırsız";

/** Dar ekranda çipin kısa hâli (taçla birlikte). */
export const FOUNDER_CREDIT_SHORT = "Sınırsız";

/** Masaüstünde çipin üstünde beliren ipucu. */
export const FOUNDER_CREDIT_TIP = "Bu hesapta hiçbir işlem kredi düşürmez.";

/** Ekran okuyucu etiketi. */
export const FOUNDER_CREDIT_ARIA = "Kurucu hesabı, kredi sınırı yok";

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
