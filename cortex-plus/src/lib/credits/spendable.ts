/**
 * Çipte görünen harcanabilir kredi.
 *
 * `credit_reserve` önce dönem hakkını (`free_allowance_remaining`), sonra
 * satın alınmış bakiyeyi düşer. Çip yalnızca bakiyeyi gösterirse kesim
 * olmuş ama sayı yerinde kalmış gibi durur.
 */

export type SpendableAccount = {
  balance: number;
  freeAllowanceRemaining: number;
};

export function spendableCredits(account: SpendableAccount): number {
  const balance = Number.isFinite(account.balance) ? account.balance : 0;
  const allowance = Number.isFinite(account.freeAllowanceRemaining)
    ? account.freeAllowanceRemaining
    : 0;
  return Math.max(0, balance) + Math.max(0, allowance);
}

/** Üretim başarıyla bittikten sonra kabuk bakiyeyi yeniden okusun. */
export const ACCOUNT_REFRESH_EVENT = "cp-account-refresh";

export function requestAccountRefresh(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ACCOUNT_REFRESH_EVENT));
}

/** Başarılı üretim: çağıran yeniler, kabuk da olayı duyar. */
export function onGenerationSucceeded(refresh?: () => void): void {
  refresh?.();
  requestAccountRefresh();
}
