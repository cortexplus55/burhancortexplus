import type { CockpitSettings } from "@/lib/founder-cockpit/settings";

/**
 * Kurucu Kokpiti finans motoru (Faz 13, 26 Kasım 2026). Saf: aynı girdi, aynı çıktı; bütün tutarlar kuruş (tam sayı).
 *
 * Varsayımlar (ekranda ve CSV'de yazılı; ön muhasebe tahminidir, beyanname değildir):
 * - Satış fiyatları KDV dahildir. Ay içinde tahsil edilen (ödendi + sonradan iade edilen) ödemeler brüt ciro; aynı ay
 *   yapılan iadeler düşülür (Birim Ekonomisi ekranıyla aynı kural).
 * - PayTR komisyonu brüt ciro üzerinden, oran KDV hariç; komisyon faturasının KDV'si indirilecek KDV'dir.
 * - Yurt dışı API ve bulut faturalarında KDV yoktur; Türkiye'de sorumlu sıfatıyla 2 No.lu KDV olarak beyan edilip ödenir
 *   ve aynı ay 1 No.lu KDV'de indirilir. Faturanın TL tutarı girilmediyse dolar tutarı kurla çevrilir.
 * - Tahmini gelir/kurumlar vergisi o ayın kârı üzerinden: Limited'de kurumlar vergisi oranı; şahısta gelir vergisi oranı
 *   (gerçek tarife dilimlidir, bu tek oran tahmindir), genç girişimci istisnası açıksa 0 (yıllık istisna sınırı mali
 *   müşavirle doğrulanır). Zarar ayında vergi 0.
 * - "Vergi Kasasına Ayır" = 1 No.lu KDV + 2 No.lu KDV + tahmini gelir/kurumlar vergisi.
 * - "Gerçek Harcanabilir Net Kâr" = net tahsilat − komisyon (KDV dahil) − yurt dışı giderler − vergi kasası
 *   (cebirsel olarak: KDV hariç satış − komisyon − yurt dışı gider − tahmini vergi).
 */

export type FinanceExpense = {
  amountUsd: number;
  amountTry: number;
  kdv2: boolean;
};

export type MonthFinanceInput = {
  /** Ay içinde tahsil edilen (ödendi + sonradan iade edilen), KDV dahil, kuruş. */
  grossKurus: number;
  /** Ay içinde yapılan iadeler, kuruş. */
  refundKurus: number;
  paymentCount: number;
  expenses: readonly FinanceExpense[];
  settings: Pick<
    CockpitSettings,
    | "companyType"
    | "corporateTaxRate"
    | "incomeTaxRate"
    | "youngEntrepreneurExempt"
    | "vatRate"
    | "paytrCommissionRate"
    | "usdTryRate"
  >;
};

export type MonthFinance = {
  grossKurus: number;
  refundKurus: number;
  paymentCount: number;
  /** Net tahsilat (KDV dahil) = brüt − iade. */
  netCollectedKurus: number;
  /** KDV hariç net satış. */
  netSalesKurus: number;
  /** Satışlardaki (hesaplanan) KDV. */
  outputVatKurus: number;
  /** PayTR komisyonu (KDV hariç) ve KDV'si. */
  commissionKurus: number;
  commissionVatKurus: number;
  /** Yurt dışı giderler. */
  foreignUsd: number;
  foreignKurus: number;
  /** 2 No.lu KDV (sorumlu sıfatıyla ödenecek). */
  kdv2Kurus: number;
  /** İndirilecek KDV (2 No.lu KDV + komisyon KDV'si). */
  deductibleVatKurus: number;
  /** 1 No.lu KDV ödenecek (eksiye düşmez). */
  kdv1PayableKurus: number;
  /** Sonraki aya devreden KDV (indirilecek > hesaplanan ise). */
  vatCarryForwardKurus: number;
  /** Vergi öncesi kâr (KDV hariç satış − komisyon − yurt dışı gider). */
  profitBeforeTaxKurus: number;
  /** Uygulanan tahmini vergi oranı ve tutarı. */
  incomeTaxRate: number;
  incomeTaxKurus: number;
  incomeTaxLabel: string;
  /** Vergi kasasına ayrılacak toplam. */
  taxVaultKurus: number;
  /** Gerçek harcanabilir net kâr. */
  spendableNetKurus: number;
};

const kurus = (value: number) =>
  Number.isFinite(value) ? Math.round(value) : 0;

/** Faturanın TL karşılığı (kuruş): TL girildiyse o, yoksa dolar × kur. */
export function expenseKurus(
  expense: FinanceExpense,
  usdTryRate: number,
): number {
  if (Number.isFinite(expense.amountTry) && expense.amountTry > 0)
    return kurus(expense.amountTry * 100);
  return kurus(Math.max(0, expense.amountUsd) * usdTryRate * 100);
}

export function effectiveIncomeTax(settings: MonthFinanceInput["settings"]): {
  rate: number;
  label: string;
} {
  if (settings.companyType === "limited")
    return {
      rate: settings.corporateTaxRate,
      label: "Tahmini kurumlar vergisi",
    };
  if (settings.youngEntrepreneurExempt)
    return { rate: 0, label: "Gelir vergisi (genç girişimci istisnası)" };
  return { rate: settings.incomeTaxRate, label: "Tahmini gelir vergisi" };
}

export function computeMonthFinance(input: MonthFinanceInput): MonthFinance {
  const { settings } = input;
  const vat = settings.vatRate;
  const grossKurus = Math.max(0, kurus(input.grossKurus));
  const refundKurus = Math.max(0, kurus(input.refundKurus));
  const netCollectedKurus = grossKurus - refundKurus;
  const netSalesKurus = kurus(netCollectedKurus / (1 + vat));
  const outputVatKurus = netCollectedKurus - netSalesKurus;

  const commissionKurus = kurus(grossKurus * settings.paytrCommissionRate);
  const commissionVatKurus = kurus(commissionKurus * vat);

  let foreignUsd = 0;
  let foreignKurus = 0;
  let kdv2BaseKurus = 0;
  for (const expense of input.expenses) {
    const value = expenseKurus(expense, settings.usdTryRate);
    foreignUsd += Number.isFinite(expense.amountUsd)
      ? Math.max(0, expense.amountUsd)
      : 0;
    foreignKurus += value;
    if (expense.kdv2) kdv2BaseKurus += value;
  }
  const kdv2Kurus = kurus(kdv2BaseKurus * vat);

  const deductibleVatKurus = kdv2Kurus + commissionVatKurus;
  const kdv1PayableKurus = Math.max(0, outputVatKurus - deductibleVatKurus);
  const vatCarryForwardKurus = Math.max(0, deductibleVatKurus - outputVatKurus);

  const profitBeforeTaxKurus = netSalesKurus - commissionKurus - foreignKurus;
  const tax = effectiveIncomeTax(settings);
  const incomeTaxKurus =
    profitBeforeTaxKurus > 0 ? kurus(profitBeforeTaxKurus * tax.rate) : 0;

  const taxVaultKurus = kdv1PayableKurus + kdv2Kurus + incomeTaxKurus;
  const spendableNetKurus =
    netCollectedKurus -
    commissionKurus -
    commissionVatKurus -
    foreignKurus -
    taxVaultKurus;

  return {
    grossKurus,
    refundKurus,
    paymentCount: Math.max(0, Math.round(input.paymentCount)),
    netCollectedKurus,
    netSalesKurus,
    outputVatKurus,
    commissionKurus,
    commissionVatKurus,
    foreignUsd: Math.round(foreignUsd * 100) / 100,
    foreignKurus,
    kdv2Kurus,
    deductibleVatKurus,
    kdv1PayableKurus,
    vatCarryForwardKurus,
    profitBeforeTaxKurus,
    incomeTaxRate: tax.rate,
    incomeTaxKurus,
    incomeTaxLabel: tax.label,
    taxVaultKurus,
    spendableNetKurus,
  };
}

/** Geçici vergi tahmini: çeyreğin kârı × oran (şahısta %15, limitedde kurumlar vergisi oranı; istisnada 0). */
export const PROVISIONAL_TAX_RATE_SAHIS = 0.15;

export function provisionalTaxRate(
  settings: MonthFinanceInput["settings"],
): number {
  if (settings.companyType === "limited") return settings.corporateTaxRate;
  return settings.youngEntrepreneurExempt ? 0 : PROVISIONAL_TAX_RATE_SAHIS;
}

/** "YYYY-MM" doğrulaması. */
export function isMonthKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** Bir ayın Türkiye saatine göre başlangıç ve bitiş anı (ISO, UTC). Türkiye 2016'dan beri sabit UTC+3. */
export function monthRangeUtc(month: string): {
  startIso: string;
  endIso: string;
} {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7)) - 1;
  const start = new Date(Date.UTC(year, index, 1, -3, 0, 0));
  const end = new Date(Date.UTC(year, index + 1, 1, -3, 0, 0));
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export function previousMonth(month: string): string {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7)) - 1;
  const date = new Date(Date.UTC(year, index - 1, 1));
  return date.toISOString().slice(0, 7);
}

/** Çeyreğin ayları ("2026-Q3" → ["2026-07","2026-08","2026-09"]). */
export function quarterMonths(period: string): string[] {
  const match = /^(\d{4})-Q([1-4])$/.exec(period);
  if (!match) return [];
  const first = (Number(match[2]) - 1) * 3 + 1;
  return [0, 1, 2].map(
    (offset) => `${match[1]}-${String(first + offset).padStart(2, "0")}`,
  );
}
