import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isFeatureEnabled } from "@/lib/admin/feature-flags";
import { planTier } from "@/lib/billing/entitlements";
import { isTrialPeriod } from "@/lib/payments/subscription";
import {
  SURVEY_ACTIVITY_DAYS,
  SURVEY_FLAG,
  SURVEY_MIN_ACCOUNT_DAYS,
  isoWeekKey,
  type SurveySegment,
} from "@/lib/feedback/weekly-survey";

const DAY_MS = 86_400_000;

export type SurveyEligibility = { show: boolean; week: string; reason?: string };

/**
 * Anket bu hafta bu öğrenciye gösterilir mi. Sırayla: anahtar açık mı, bu hafta satır var mı
 * (cevap ya da "Şimdi değil"), hesap en az iki günlük mü, son yedi günde bir etkinlik açmış mı.
 * Bir okuma düşerse gösterilmez — anket hiçbir şeyi bozmamalı.
 */
export async function surveyEligibility(
  service: SupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<SurveyEligibility> {
  const week = isoWeekKey(now);
  try {
    if (!(await isFeatureEnabled(service, SURVEY_FLAG))) return { show: false, week, reason: "off" };

    const [{ data: existing, error: existingError }, { data: profile }, { count, error: activityError }] = await Promise.all([
      service.from("weekly_surveys").select("id").eq("user_id", userId).eq("week_key", week).maybeSingle(),
      service.from("profiles").select("created_at").eq("id", userId).maybeSingle(),
      service
        .from("exam_prep_node_attempts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", new Date(now.getTime() - SURVEY_ACTIVITY_DAYS * DAY_MS).toISOString()),
    ]);
    if (existingError || activityError) return { show: false, week, reason: "unavailable" };
    if (existing) return { show: false, week, reason: "done" };

    const created = profile?.created_at ? new Date(profile.created_at as string).getTime() : NaN;
    if (!Number.isFinite(created) || now.getTime() - created < SURVEY_MIN_ACCOUNT_DAYS * DAY_MS) {
      return { show: false, week, reason: "new_account" };
    }
    if (!count) return { show: false, week, reason: "inactive" };
    return { show: true, week };
  } catch {
    return { show: false, week, reason: "unavailable" };
  }
}

/** Cevabın yanına yazılan anlık plan: beta denemesi ayrı sayılsın. */
export async function surveySegment(service: SupabaseClient, userId: string): Promise<SurveySegment | null> {
  try {
    const { data: sub } = await service
      .from("subscriptions")
      .select("trial_until, current_period_end")
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();
    if (sub && isTrialPeriod(sub as { trial_until: string | null; current_period_end: string | null })) return "beta";
    const tier = await planTier(service, userId);
    return tier === "plus" || tier === "sigma" ? tier : "free";
  } catch {
    return null;
  }
}
