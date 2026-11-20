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

/**
 * Markayla birlikte paket etiketi (19 Kasım 2026, Faz 5 denetimi): paket adı "Plus" olduğu için "Cortex Plus Plus" diye
 * okunuyordu. Marka ile paket bir tire ile ayrılır, paket adının sonunda "Paketi" bir kez yazılır:
 * "Plus" → "Cortex Plus — Plus Paketi", "Sınav Haftası" → "Cortex Plus — Sınav Haftası Paketi".
 */
export function parentPackageLabel(planName: string): string {
  const name = planName.trim().replace(/^cortex\s+plus\s*[—–-]?\s*/i, "") || PLAN_MARKETING_COPY.plus.name;
  const packaged = /\bpaket(i)?$/i.test(name) ? name.replace(/\bpaket$/i, "Paketi") : `${name} Paketi`;
  return `Cortex Plus — ${packaged}`;
}
