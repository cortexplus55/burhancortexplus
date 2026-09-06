import { planGrantsSubscription } from "@/lib/payments/beneficiary";

export type BillingPeriod = "one_time" | "monthly" | "yearly";

export type SubscriptionPlanInfo = {
  name?: string | null;
  is_premium?: boolean | null;
  billing_period?: string | null;
  period_days?: number | null;
  tier?: string | null;
};

/** Yenileme hatırlatması bitişten kaç gün önce gider. */
export const RENEWAL_REMINDER_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

export function billingPeriodOf(
  plan: SubscriptionPlanInfo | null | undefined,
): BillingPeriod {
  const value = plan?.billing_period;
  if (value === "monthly" || value === "yearly" || value === "one_time") {
    return value;
  }
  // Sütun eklenmeden önce yazılmış satırlar: is_premium abonelik demekti.
  return planGrantsSubscription(plan) ? "monthly" : "one_time";
}

export function isSubscriptionPlan(
  plan: SubscriptionPlanInfo | null | undefined,
): boolean {
  return billingPeriodOf(plan) !== "one_time";
}

/** Bir ödemenin açtığı gün sayısı. */
export function planPeriodDays(
  plan: SubscriptionPlanInfo | null | undefined,
): number {
  const explicit = plan?.period_days;
  if (typeof explicit === "number" && explicit > 0) return explicit;
  return billingPeriodOf(plan) === "yearly" ? 365 : 30;
}

/**
 * Yenilemede kalan süre yanmaz.
 *
 * Bitişine 10 gün kalmışken yenileyen öğrenci 30 değil 40 gün almalı; aksi
 * hâlde erken yenilemek cezalandırılır ve kimse süresi dolmadan yenilemez.
 */
export function nextPeriodEnd(
  currentEnd: string | Date | null | undefined,
  days: number,
  now: Date = new Date(),
): Date {
  const parsed = currentEnd ? new Date(currentEnd) : null;
  const valid = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
  const from = valid && valid.getTime() > now.getTime() ? valid : now;
  return new Date(from.getTime() + days * DAY_MS);
}

export function periodLabel(period: BillingPeriod): string {
  if (period === "yearly") return "yıllık";
  if (period === "monthly") return "aylık";
  return "tek seferlik";
}

/** "aylık faturalandırılır" / "yıllık faturalandırılır" */
export function billingNote(period: BillingPeriod): string {
  return period === "one_time"
    ? "tek seferlik ödeme"
    : `${periodLabel(period)} faturalandırılır`;
}

export function daysUntil(
  end: string | Date | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!end) return null;
  const date = new Date(end);
  if (Number.isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime() - now.getTime()) / DAY_MS);
}

/**
 * Hatırlatma yalnızca bir kez, dönemin son günlerinde ve iptal edilmemiş
 * aboneliklere gider. `renewal_reminder_sent_at` dönem başından sonraysa
 * bu dönemin hatırlatması zaten gitmiştir.
 */
export function needsRenewalReminder(
  sub: {
    status?: string | null;
    current_period_end?: string | null;
    current_period_start?: string | null;
    renewal_reminder_sent_at?: string | null;
    cancel_at_period_end?: boolean | null;
  },
  now: Date = new Date(),
): boolean {
  if (sub.status !== "active") return false;
  if (sub.cancel_at_period_end) return false;

  const left = daysUntil(sub.current_period_end, now);
  if (left === null || left < 0 || left > RENEWAL_REMINDER_DAYS) return false;

  const sentAt = sub.renewal_reminder_sent_at
    ? new Date(sub.renewal_reminder_sent_at)
    : null;
  if (!sentAt || Number.isNaN(sentAt.getTime())) return true;

  const periodStart = sub.current_period_start
    ? new Date(sub.current_period_start)
    : null;
  if (!periodStart || Number.isNaN(periodStart.getTime())) {
    // Dönem başı bilinmiyorsa aynı hatırlatmayı tekrar göndermektense sus.
    return false;
  }
  return sentAt.getTime() < periodStart.getTime();
}

/** Süresi dolmuş ama hâlâ "active" görünen abonelikler. */
export function hasExpired(
  sub: { status?: string | null; current_period_end?: string | null },
  now: Date = new Date(),
): boolean {
  if (sub.status !== "active") return false;
  if (!sub.current_period_end) return false;
  const end = new Date(sub.current_period_end);
  return !Number.isNaN(end.getTime()) && end.getTime() <= now.getTime();
}
