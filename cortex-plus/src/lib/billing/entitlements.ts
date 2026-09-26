import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Tek canonical plan / entitlement kaynağı.
 *
 * UI kendi başına plan kararı vermez. Sunucu bu modülden üretir; API
 * uçları da aynı sonucu kullanır. Badge / isPremium / planTier ayrışması
 * (isim substring vs. tier kolonu) buradan kapanır.
 *
 * Kitle (2026-09-24, Astra hizası): kapı özellikte değil, kullanımda.
 * Misafir model çağırmaz. Kayıtlı ücretsiz öğrenme stüdyolarına girer ve
 * kredi yer. Plus / Sigma aynı yüzeyi daha yüksek kotayla kullanır;
 * gelişmiş model Sigma'dadır.
 */

export type PlanTier = "free" | "plus" | "sigma";

/** Oturumsuz misafir, kayıtlı ücretsiz, ya da ücretli kademe. */
export type Audience = "guest" | "free" | "plus" | "sigma";

export type SubscriptionStatus =
  | "none"
  | "active"
  | "cancelling"
  | "expired";

export type FeatureKey =
  | "podcast"
  | "speech"
  | "oral_transcribe"
  | "advanced_chat"
  | "photo_quota_plus"
  | "photo_quota_sigma";

export type UserEntitlements = {
  /** Kayıtsız istek `guest`. Aboneliği olmayan hesap `free`. */
  audience: Audience;
  plan: PlanTier;
  planSlug: string | null;
  planName: string | null;
  subscriptionStatus: SubscriptionStatus;
  subscriptionPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  isPaid: boolean;
  isPremium: boolean;
  badge: "Plus" | "Sigma" | null;
  monthlyAllowance: number | null;
  modelTier: "standard" | "advanced";
  /**
   * Ücretsize özel yükseltme kromu: Satın al, kampanya bandı, sohbet kartı.
   * Misafir pazarlama CTA'sı kullanır; Plus/Sigma bu kromu görmez.
   */
  showsUpgradeChrome: boolean;
  features: Record<FeatureKey, boolean>;
  photoPageLimit: number;
};

export const PHOTO_PAGE_LIMITS: Record<PlanTier, number> = {
  free: 2,
  plus: 300,
  sigma: 1000,
};

function featureMap(input: {
  studios: boolean;
  advancedChat: boolean;
  photoPlus: boolean;
  photoSigma: boolean;
}): Record<FeatureKey, boolean> {
  return {
    podcast: input.studios,
    speech: input.studios,
    oral_transcribe: input.studios,
    advanced_chat: input.advancedChat,
    photo_quota_plus: input.photoPlus,
    photo_quota_sigma: input.photoSigma,
  };
}

/**
 * Oturum yok. Öğrenme özelliği yok, fotoğraf hakkı yok, yükseltme kromu yok.
 * Pazarlama ve hazır demo bu nesneyi kullanmaz; API'nin "kimse yok" cevabıdır.
 */
export function emptyGuestAudience(): UserEntitlements {
  return {
    audience: "guest",
    plan: "free",
    planSlug: null,
    planName: null,
    subscriptionStatus: "none",
    subscriptionPeriodEnd: null,
    cancelAtPeriodEnd: false,
    isPaid: false,
    isPremium: false,
    badge: null,
    monthlyAllowance: null,
    modelTier: "standard",
    showsUpgradeChrome: false,
    features: featureMap({
      studios: false,
      advancedChat: false,
      photoPlus: false,
      photoSigma: false,
    }),
    photoPageLimit: 0,
  };
}

/** Kayıtlı, aboneliği olmayan hesap. Stüdyolar açık; kota günlük. */
function registeredFreeEntitlements(): UserEntitlements {
  return {
    audience: "free",
    plan: "free",
    planSlug: null,
    planName: null,
    subscriptionStatus: "none",
    subscriptionPeriodEnd: null,
    cancelAtPeriodEnd: false,
    isPaid: false,
    isPremium: false,
    badge: null,
    monthlyAllowance: null,
    modelTier: "standard",
    showsUpgradeChrome: true,
    features: featureMap({
      studios: true,
      advancedChat: false,
      photoPlus: false,
      photoSigma: false,
    }),
    photoPageLimit: PHOTO_PAGE_LIMITS.free,
  };
}

function resolveTier(plan: {
  is_premium?: boolean | null;
  tier?: string | null;
  name?: string | null;
  slug?: string | null;
}): PlanTier {
  if (!plan.is_premium) return "free";
  const tier = (plan.tier ?? "").toLowerCase();
  if (tier === "sigma") return "sigma";
  if (tier === "plus") return "plus";
  // Eski satırlar: tier kolonu boş olabilir — isim/slug yedek.
  const haystack = `${plan.name ?? ""} ${plan.slug ?? ""}`.toLowerCase();
  if (haystack.includes("sigma")) return "sigma";
  return "plus";
}

function periodStillValid(periodEnd: string | null | undefined): boolean {
  if (!periodEnd) return true;
  const end = new Date(periodEnd);
  if (Number.isNaN(end.getTime())) return false;
  return end.getTime() > Date.now();
}

/**
 * Abonelik satırından plan kademesini çıkarır (saf; test edilebilir).
 * Satır yoksa kayıtlı ücretsizdir — misafir buraya düşmez.
 */
export function entitlementsFromSubscriptionRow(row: {
  status?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean | null;
  plans?: {
    is_premium?: boolean | null;
    tier?: string | null;
    name?: string | null;
    slug?: string | null;
    monthly_allowance?: number | null;
  } | null;
} | null): UserEntitlements {
  if (!row?.plans) return registeredFreeEntitlements();

  const activeStatus = row.status === "active";
  const stillValid = periodStillValid(row.current_period_end);
  if (!activeStatus || !stillValid) {
    return {
      ...registeredFreeEntitlements(),
      subscriptionStatus: stillValid ? "none" : "expired",
      subscriptionPeriodEnd: row.current_period_end ?? null,
      cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    };
  }

  const plan = row.plans;
  const tier = resolveTier(plan);
  if (tier === "free") return registeredFreeEntitlements();

  const cancelAtPeriodEnd = Boolean(row.cancel_at_period_end);
  const sigma = tier === "sigma";

  return {
    audience: tier,
    plan: tier,
    planSlug: plan.slug ?? null,
    planName: plan.name ?? null,
    subscriptionStatus: cancelAtPeriodEnd ? "cancelling" : "active",
    subscriptionPeriodEnd: row.current_period_end ?? null,
    cancelAtPeriodEnd,
    isPaid: true,
    isPremium: true,
    badge: sigma ? "Sigma" : "Plus",
    monthlyAllowance: plan.monthly_allowance ?? null,
    modelTier: sigma ? "advanced" : "standard",
    showsUpgradeChrome: false,
    features: featureMap({
      studios: true,
      advancedChat: sigma,
      photoPlus: true,
      photoSigma: sigma,
    }),
    photoPageLimit: PHOTO_PAGE_LIMITS[tier],
  };
}

export async function getUserEntitlements(
  service: SupabaseClient,
  userId: string,
): Promise<UserEntitlements> {
  const { data } = await service
    .from("subscriptions")
    .select(
      "status, current_period_end, cancel_at_period_end, plans(is_premium, tier, name, slug, monthly_allowance)",
    )
    .eq("user_id", userId)
    .eq("status", "active")
    // Cron `inactive` yazmadan önce de süresi dolan abonelik SQL'de düşer;
    // TS tarafındaki `periodStillValid` ikinci savunma hattı olarak kalır.
    .or(`current_period_end.is.null,current_period_end.gt.${new Date().toISOString()}`)
    .maybeSingle();

  return entitlementsFromSubscriptionRow(
    data as Parameters<typeof entitlementsFromSubscriptionRow>[0],
  );
}

/**
 * Özellik açık mı. Öğrenme stüdyoları kayıtlı ücretsizde de açıktır;
 * harcama `credit_reserve` ile olur. `advanced_chat` yalnız Sigma.
 */
export function requireFeature(
  entitlements: UserEntitlements,
  feature: FeatureKey,
): boolean {
  return entitlements.features[feature] === true;
}

/** Misafir öğrenme API'sine giremez. */
export function requireSignedIn(entitlements: UserEntitlements): boolean {
  return entitlements.audience !== "guest";
}

export async function isPremiumUser(
  service: SupabaseClient,
  userId: string,
): Promise<boolean> {
  return (await getUserEntitlements(service, userId)).isPremium;
}

export async function planTier(
  service: SupabaseClient,
  userId: string,
): Promise<PlanTier> {
  return (await getUserEntitlements(service, userId)).plan;
}
