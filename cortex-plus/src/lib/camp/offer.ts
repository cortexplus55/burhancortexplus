/**
 * Kamp modu (Paket 5): sınava ≤ 7 gün kalan ücretsiz öğrenciye mevcut Plus Haftalık planına sakin yönlendirme.
 * Yeni ürün yok: plans `plus-haftalik` (34900 kuruş, 7 gün). Plus/Sigma'da ve sınav geçtiyse gösterilmez.
 */
export const CAMP_MAX_DAYS = 7;

export type CampOffer = { daysLeft: number; weeklyKurus: number | null; href: string };

export function campOffer(input: { daysLeft: number | null; examPassed: boolean; showsUpgradeChrome: boolean; weeklyKurus: number | null }): CampOffer | null {
  const { daysLeft } = input;
  if (daysLeft == null || input.examPassed || !input.showsUpgradeChrome) return null;
  if (daysLeft < 0 || daysLeft > CAMP_MAX_DAYS) return null;
  return { daysLeft, weeklyKurus: input.weeklyKurus, href: "/pay" };
}

export function campHeadline(daysLeft: number): string {
  if (daysLeft === 0) return "Sınavın bugün. Kısa bir tekrar yeter.";
  return `Sınavına ${daysLeft} gün kaldı: kamp haftası.`;
}
