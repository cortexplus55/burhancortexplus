import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { auditLog } from "@/lib/audit";
import {
  billingPeriodOf,
  daysUntil,
  isSubscriptionPlan,
} from "@/lib/payments/subscription";

const PLAN_FIELDS =
  "id, slug, name, price_try, billing_period, period_days, tier, is_premium, monthly_allowance";

type PlanRow = {
  id: string;
  slug: string | null;
  name: string | null;
  price_try: number | null;
  billing_period: string | null;
  period_days: number | null;
  tier: string | null;
  is_premium: boolean | null;
  monthly_allowance: number | null;
};

/** Öğrencinin aboneliği: hangi plan, ne zaman bitiyor, iptal edilmiş mi. */
export async function GET(request: Request) {
  const guard = await withUser(request, { scope: "subscription-read", limit: 60 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const { data: sub } = await service
    .from("subscriptions")
    .select(
      `id, status, billing_period, current_period_start, current_period_end,
       cancel_at_period_end, auto_renew, plans(${PLAN_FIELDS})`,
    )
    .eq("user_id", userId)
    .eq("status", "active")
    .order("current_period_end", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (!sub) {
    return NextResponse.json({ subscription: null });
  }

  const plan = (sub.plans as unknown as PlanRow | null) ?? null;

  return NextResponse.json({
    subscription: {
      status: sub.status,
      billingPeriod: sub.billing_period ?? billingPeriodOf(plan),
      currentPeriodStart: sub.current_period_start,
      currentPeriodEnd: sub.current_period_end,
      daysLeft: daysUntil(sub.current_period_end),
      cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
      autoRenew: Boolean(sub.auto_renew),
      plan: plan
        ? {
            id: plan.id,
            slug: plan.slug,
            name: plan.name,
            tier: plan.tier,
            priceTry: plan.price_try,
            monthlyAllowance: plan.monthly_allowance,
          }
        : null,
    },
  });
}

const bodySchema = z.object({
  action: z.enum(["cancel", "resume"]),
});

/**
 * İptal aboneliği anında kapatmaz — ödenen dönem sonuna kadar açık kalır.
 * Parası ödenmiş günü elinden almak, iptali cezaya çevirir.
 */
export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "subscription-write", limit: 10 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const { data: sub } = await service
    .from("subscriptions")
    .select("id, cancel_at_period_end, current_period_end, plans(name, billing_period)")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("current_period_end", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  if (!sub) return errorResponse(404, "not_found");

  const plan = sub.plans as unknown as {
    name?: string | null;
    billing_period?: string | null;
  } | null;
  if (!isSubscriptionPlan(plan)) return errorResponse(400, "invalid_input");

  const cancel = parsed.data.action === "cancel";
  if (Boolean(sub.cancel_at_period_end) === cancel) {
    return NextResponse.json({ cancelAtPeriodEnd: cancel, changed: false });
  }

  const { error } = await service
    .from("subscriptions")
    .update({
      cancel_at_period_end: cancel,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sub.id);

  if (error) return errorResponse(500, "generation_failed");

  await auditLog(service, {
    actorId: userId,
    action: cancel ? "subscription.cancelled" : "subscription.resumed",
    entityType: "subscription",
    entityId: sub.id,
    metadata: {
      plan: plan?.name ?? null,
      period_end: sub.current_period_end,
    },
  });

  return NextResponse.json({ cancelAtPeriodEnd: cancel, changed: true });
}
