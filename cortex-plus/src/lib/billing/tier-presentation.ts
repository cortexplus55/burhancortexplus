import { PHOTO_PAGE_LIMITS, type Audience } from "@/lib/billing/entitlements";
import { periodLabel, type PeriodKind } from "@/lib/credits/period";
import { formatDate } from "@/lib/format";

import { FREE_PAGE_TOTAL, FREE_PREP_LIMIT } from "@/lib/billing/free-tier-copy";
import { PLAN_ALLOWANCES, allowanceInWork } from "@/lib/credits/price-table";

/**
 * Fiyat, profil ve kabuk aynı cümleleri buradan okur.
 * Ücretsizde açık olan bir stüdyo Plus'a özel diye yazılmaz.
 */

export const BENEFITS_LEAD = "Ücretsiz plandaki her şey ve:";

/**
 * Hak somut sayıyla anlatılır (8 Ekim 2026, ürün sahibinin kararı): "kat"
 * değil, ne kadar iş. Sayılar kredi tablosundan; tablo değişirse cümle de.
 */
export function allowanceWorkLine(allowance: number, per: "ay" | "hafta" = "ay"): string {
  const { messages, lessons } = allowanceInWork(allowance);
  const fmt = (value: number) => value.toLocaleString("tr-TR");
  return `${per === "ay" ? "Ayda" : "Haftada"} yaklaşık ${fmt(messages)} mesaj ya da ${fmt(lessons)} ders`;
}

export function plusBenefitLines(): string[] {
  return [
    allowanceWorkLine(PLAN_ALLOWANCES.plusMonthly),
    "Sınırsız sınav hazırlığı ve belgenin tamamı işlenir",
    `Daha yüksek fotoğraf ve PDF limiti (${PHOTO_PAGE_LIMITS.plus} sayfa)`,
    "Hakkın bitince ek paket alabilme",
  ];
}

export function sigmaBenefitLines(): string[] {
  return [
    "Plus’taki her şey",
    allowanceWorkLine(PLAN_ALLOWANCES.sigmaMonthly),
    "Gelişmiş model",
    `Daha yüksek fotoğraf ve PDF limiti (${PHOTO_PAGE_LIMITS.sigma} sayfa)`,
    "Ek paket",
  ];
}

export function parentPlusBenefitLines(): string[] {
  return [
    "Kota çocuğunun hesabına tanımlanır",
    allowanceWorkLine(PLAN_ALLOWANCES.plusMonthly),
    `Daha yüksek fotoğraf ve PDF limiti (${PHOTO_PAGE_LIMITS.plus} sayfa)`,
    "Hakkı bitince ek paket",
  ];
}

export function parentSigmaBenefitLines(): string[] {
  return [
    "Plus’taki her şey çocuğunun hesabında",
    "Daha yüksek aylık kota",
    "Gelişmiş model",
    `Daha yüksek yükleme limiti (${PHOTO_PAGE_LIMITS.sigma} sayfa)`,
  ];
}

export type TierComparisonRow = {
  label: string;
  guest: string;
  free: string;
  plus: string;
  sigma: string;
};

/** Misafirin de gördüğü karşılaştırma. Rakamlar foto limitlerinden gelir. */
export function tierComparisonRows(): TierComparisonRow[] {
  return [
    {
      label: "Öğrenme stüdyoları",
      guest: "Yok",
      free: "Açık",
      plus: "Açık",
      sigma: "Açık",
    },
    {
      label: "AI kullanımı",
      guest: "Yok",
      // Kredi sistemi v2 (8 Ekim 2026): günde 6 kredi — bir ders ya da iki mesaj.
      free: "Günde 1 ders",
      plus: allowanceWorkLine(PLAN_ALLOWANCES.plusMonthly),
      sigma: allowanceWorkLine(PLAN_ALLOWANCES.sigmaMonthly),
    },
    {
      label: "Sınav hazırlığı",
      guest: "—",
      free: String(FREE_PREP_LIMIT),
      plus: "Sınırsız",
      sigma: "Sınırsız",
    },
    {
      label: "Belge işleme",
      guest: "—",
      free: `Toplam ${FREE_PAGE_TOTAL} sayfa`,
      plus: "Belgenin tamamı",
      sigma: "Belgenin tamamı",
    },
    {
      label: "Foto / PDF sayfa",
      guest: "—",
      free: String(PHOTO_PAGE_LIMITS.free),
      plus: String(PHOTO_PAGE_LIMITS.plus),
      sigma: String(PHOTO_PAGE_LIMITS.sigma),
    },
    {
      label: "Model",
      guest: "—",
      free: "Standart",
      plus: "Standart",
      sigma: "Gelişmiş",
    },
    {
      label: "Ek paket",
      guest: "—",
      free: "Yok",
      plus: "Var",
      sigma: "Var",
    },
  ];
}

export type UpgradeChrome = {
  showBuyNav: boolean;
  showCampaignBanner: boolean;
  showChatUpgradeCard: boolean;
  showTopUp: boolean;
  badge: "Plus" | "Sigma" | null;
  planLabel: "Temel" | "Plus" | "Sigma" | null;
};

/** Kabuktaki Satın al / bant / sohbet kartı tek bakışta. */
export function upgradeChrome(audience: Audience): UpgradeChrome {
  const paid = audience === "plus" || audience === "sigma";
  return {
    showBuyNav: audience === "free",
    showCampaignBanner: audience === "free",
    showChatUpgradeCard: audience === "free",
    showTopUp: paid,
    badge: audience === "sigma" ? "Sigma" : audience === "plus" ? "Plus" : null,
    planLabel:
      audience === "free"
        ? "Temel"
        : audience === "plus"
          ? "Plus"
          : audience === "sigma"
            ? "Sigma"
            : null,
  };
}

/**
 * Cüzdan satırı yokken dönemin türü. Haftalık paket cüzdanda `weekly`
 * yazınca ekran onu gösterir; bu yalnızca varsayılan.
 */
export function defaultQuotaKind(audience: Audience): PeriodKind | null {
  if (audience === "guest") return null;
  if (audience === "free") return "daily";
  return "monthly";
}

export function quotaKindLabel(audience: Audience): string | null {
  const kind = defaultQuotaKind(audience);
  return kind ? periodLabel(kind) : null;
}

export function profilePlanView(account: {
  audience: Audience;
  resetsAtLabel: string;
  periodKind: PeriodKind;
  subscriptionPeriodEnd: string | null;
}): { label: string; hint: string; isPremium: boolean } | null {
  if (account.audience === "guest") return null;
  if (account.audience === "plus" || account.audience === "sigma") {
    const badge = account.audience === "sigma" ? "Sigma" : "Plus";
    const quotaName =
      account.periodKind === "weekly" ? "Haftalık kota" : "Aylık kota";
    const end = account.subscriptionPeriodEnd
      ? `Dönem ${formatDate(account.subscriptionPeriodEnd)} bitiyor`
      : quotaName;
    return {
      label: badge,
      hint: `${end} · ek paket alabilirsin`,
      isPremium: true,
    };
  }
  const period =
    account.periodKind === "monthly"
      ? "aylık"
      : account.periodKind === "weekly"
        ? "haftalık"
        : "günlük";
  return {
    label: "Temel",
    hint: `Ücretsiz plan · ${period} hak, ${account.resetsAtLabel} yenilenir`,
    isPremium: false,
  };
}
