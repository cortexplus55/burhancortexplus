import { PHOTO_PAGE_LIMITS, type Audience } from "@/lib/billing/entitlements";
import { periodLabel, type PeriodKind } from "@/lib/credits/period";
import { formatDate } from "@/lib/format";

import { FREE_PAGE_TOTAL, FREE_PREP_LIMIT } from "@/lib/billing/free-tier-copy";
import { FREE_CHAT_PER_DAY, FREE_LESSONS_PER_WEEK, freeMeterResetLine } from "@/lib/billing/free-meters";
import { PLAN_ALLOWANCES, allowanceInWork } from "@/lib/credits/price-table";

/**
 * Fiyat, profil ve kabuk aynı cümleleri buradan okur.
 * Ücretsizde açık olan bir stüdyo Plus'a özel diye yazılmaz.
 */

export const BENEFITS_LEAD = "Ücretsiz plandaki her şey ve:";

/** Haftalık Plus — ana sayfa ve /fiyatlandirma aynı adı kullanır. */
export const WEEKLY_PLUS_PLAN_NAME = "Sınav Haftası (7 Günlük Plus)";

/** Kayıtsız sütunun görünen adı. Eski "Misafir" yanıltıyordu: gidecek yer yoktu. */
export const GUEST_PREVIEW_COLUMN = "Ön İzleme (Kayıtsız)";
export const GUEST_PREVIEW_OPEN = "Açık (Ön izleme)";
export const GUEST_PREVIEW_HREF = "/ornek";
export const GUEST_PREVIEW_CTA = "👀 Kayıt Olmadan Örnek Dersi Gör";

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

/**
 * Misafirin de gördüğü karşılaştırma. Rakamlar foto limitlerinden gelir.
 *
 * 19 Ekim 2026: "Model: Standart / Standart / Gelişmiş" satırı kalktı — her plan aynı modeli kullanıyor
 * (`model-router.ts`), Sigma'nın "gelişmiş" bayrağı hiçbir yere bağlı değildi. Gerçek farklar: hak,
 * ücretsizde kapalı işler (podcast, sözlü, yazılı deneme, video, ses; `PLUS_ONLY_ACTIONS`), video ders,
 * hazır içerik yokken hızlı yazım (`fast-access.ts`).
 */
export function tierComparisonRows(): TierComparisonRow[] {
  return [
    {
      label: "AI kullanımı",
      guest: "Yok",
      // Sayıya dayalı ücretsiz katman (24 Ekim 2026).
      free: "Haftada 3 ders, günde 3 mesaj, günde 1 fotoğraf",
      plus: allowanceWorkLine(PLAN_ALLOWANCES.plusMonthly),
      sigma: allowanceWorkLine(PLAN_ALLOWANCES.sigmaMonthly),
    },
    {
      label: "Ders, test, kartlar, AI öğretmen",
      guest: "Yok",
      free: "Açık",
      plus: "Açık",
      sigma: "Açık",
    },
    {
      label: "Podcast, sözlü ve yazılı deneme",
      guest: "—",
      free: "Plus'ta",
      plus: "Açık",
      sigma: "Açık",
    },
    {
      label: "Video ders",
      guest: "—",
      free: "Yok",
      plus: "Var",
      sigma: "Var",
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
      // "Günde 1 fotoğraf" soru çözme hakkıyla karışıyordu (24 Ekim 2026): bu satır belgeye yüklenen resim sayfaları.
      label: "Belgeye yüklenen fotoğraf / taranmış sayfa (ayda)",
      guest: "—",
      free: String(PHOTO_PAGE_LIMITS.free),
      plus: String(PHOTO_PAGE_LIMITS.plus),
      sigma: String(PHOTO_PAGE_LIMITS.sigma),
    },
    {
      label: "Hazır içerik yokken yazım",
      guest: "—",
      free: "Normal",
      plus: "Hızlı",
      sigma: "Hızlı",
    },
    {
      label: "Ek paket",
      guest: "—",
      free: "Yok",
      plus: "Var",
      sigma: "Var",
    },
    {
      label: "Örnek ders",
      guest: GUEST_PREVIEW_OPEN,
      free: "Açık",
      plus: "Açık",
      sigma: "Açık",
    },
    {
      label: "İnteraktif simülasyonlar",
      guest: GUEST_PREVIEW_OPEN,
      free: "Açık",
      plus: "Açık",
      sigma: "Açık",
    },
    {
      label: "Paylaşılan düello",
      guest: GUEST_PREVIEW_OPEN,
      free: "Açık",
      plus: "Açık",
      sigma: "Açık",
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
  // Ücretsiz hesap sayaçla (24 Ekim 2026): dönem türü ve cüzdanın yenilenme tarihi anlamsız. Eskiden
  // "günlük hak, 26 Ekim 00:00 yenilenir" yazıyordu: günlük hak yok, tarih ders sayacının Pazartesi'si.
  return {
    label: "Temel",
    hint: `Ücretsiz plan · haftada ${FREE_LESSONS_PER_WEEK} ders, günde ${FREE_CHAT_PER_DAY} mesaj · ${freeMeterResetLine("lesson")}`,
    isPremium: false,
  };
}

/**
 * Ücretsiz hesaptaki cüzdan bakiyesi işle (24 Ekim 2026): "Ek hakkın: yaklaşık 3 ders". Öğrenci kredi
 * sayısı görmez; bir derse yetmiyorsa mesaj sayısı, ona da yetmiyorsa hiçbir şey.
 *
 * "Hediye" yazılmaz: bakiye davet hediyesi olabildiği gibi aboneliği biten öğrencinin satın aldığı ek
 * paket ya da eski bir promosyon da olabilir; hangisi olduğunu ayırmak defterden ayrı bir okuma ister.
 */
export function freeExtraLine(balance: number): string | null {
  if (!(balance > 0)) return null;
  const { lessons, messages } = allowanceInWork(balance);
  if (lessons > 0) return `Ek hakkın: yaklaşık ${lessons} ders`;
  if (messages > 0) return `Ek hakkın: yaklaşık ${messages} mesaj`;
  return null;
}
