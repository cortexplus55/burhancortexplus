import { PLAN_MARKETING_COPY } from "@/lib/marketing/plan-copy";

/**
 * Veli bağlantısındaki paketin satıştaki adı (Faz 5 §2). Veritabanında haftalık ve aylık Plus'ın adı aynı ("Plus");
 * veli WhatsApp'ta ve ödeme sayfasında hangi paketi onayladığını adıyla görmeli. Ad, fiyat sayfasının adıyla aynı
 * kaynaktan (`PLAN_MARKETING_COPY`) okunur; tanınmayan planın veritabanı adı aynen kullanılır.
 */
export function parentLinkPlanName(plan: { name?: string | null; billing_period?: string | null; tier?: string | null }): string {
  const name = String(plan.name ?? "").trim();
  const tier = String(plan.tier ?? "").toLowerCase() || (name.toLowerCase().includes("sigma") ? "sigma" : "plus");
  if (plan.billing_period === "weekly") return PLAN_MARKETING_COPY.week.name;
  if (plan.billing_period === "monthly") return tier === "sigma" ? PLAN_MARKETING_COPY.sigma.name : PLAN_MARKETING_COPY.plus.name;
  return name || PLAN_MARKETING_COPY.plus.name;
}

/** Abonelik paketleri (veli bağlantısı yalnız bunlar için üretilir; ek paket abone içindir). */
export function isParentLinkPlan(plan: { billing_period?: string | null }): boolean {
  return plan.billing_period === "weekly" || plan.billing_period === "monthly" || plan.billing_period === "yearly";
}
