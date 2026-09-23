import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Tek canonical plan / entitlement kaynağı.
 *
 * UI kendi başına plan kararı vermez. Sunucu bu modülden üretir; API
 * uçları da aynı sonucu kullanır. Badge / isPremium / planTier ayrışması
 * (isim substring vs. tier kolonu) buradan kapanır.
 */

export type PlanTier = "free" | "plus" | "sigma";

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
  features: Record<FeatureKey, boolean>;
  photoPageLimit: number;
};

export const PHOTO_PAGE_LIMITS: Record<PlanTier, number> = {
  free: 2,
  plus: 300,
  sigma: 1000,
};

const PREMIUM_FEATURES: FeatureKey[] = [
  "podcast",
  "speech",
  "oral_transcribe",
  "advanced_chat",
  "photo_quota_plus",
];

function emptyEntitlements(): UserEntitlements {
  return {
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
    features: {
      podcast: false,
      speech: false,
      oral_transcribe: false,
      advanced_chat: false,
      photo_quota_plus: false,
      photo_quota_sigma: false,
    },
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
  if (!row?.plans) return emptyEntitlements();

  const activeStatus = row.status === "active";
  const stillValid = periodStillValid(row.current_period_end);
  if (!activeStatus || !stillValid) {
    return {
      ...emptyEntitlements(),
      subscriptionStatus: stillValid ? "none" : "expired",
      subscriptionPeriodEnd: row.current_period_end ?? null,
      cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    };
  }

  const plan = row.plans;
  const tier = resolveTier(plan);
  if (tier === "free") return emptyEntitlements();

  const cancelAtPeriodEnd = Boolean(row.cancel_at_period_end);
  const features = emptyEntitlements().features;
  for (const key of PREMIUM_FEATURES) features[key] = true;
  features.photo_quota_sigma = tier === "sigma";

  return {
    plan: tier,
    planSlug: plan.slug ?? null,
    planName: plan.name ?? null,
    subscriptionStatus: cancelAtPeriodEnd ? "cancelling" : "active",
    subscriptionPeriodEnd: row.current_period_end ?? null,
    cancelAtPeriodEnd,
    isPaid: true,
    isPremium: true,
    badge: tier === "sigma" ? "Sigma" : "Plus",
    monthlyAllowance: plan.monthly_allowance ?? null,
    modelTier: tier === "sigma" ? "advanced" : "standard",
    features,
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
    .maybeSingle();

  return entitlementsFromSubscriptionRow(
    data as Parameters<typeof entitlementsFromSubscriptionRow>[0],
  );
}

/** Ücretli özellik — UI gizlemesi yetmez; API bunu çağırmalı. */
export function requireFeature(
  entitlements: UserEntitlements,
  feature: FeatureKey,
): boolean {
  return entitlements.features[feature] === true;
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
