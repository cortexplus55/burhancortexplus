import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { appOrigin } from "@/lib/app-url";
import { formatTryWhole } from "@/lib/format";
import { isPaytrConfigured } from "@/lib/payments/paytr";
import {
  createParentPayToken,
  PARENT_LINK_TTL_MS,
  parentPayUrl,
  parentShareText,
  whatsappShareUrl,
} from "@/lib/payments/parent-link";
import { isParentLinkPlan, parentLinkPlanName } from "@/lib/payments/parent-link-plan";

const bodySchema = z.object({ planId: z.string().uuid() });

/**
 * Velime WhatsApp'tan ödeme linki (Faz 5 §2, 19 Kasım 2026). Oturumlu öğrenci seçtiği abonelik paketi için
 * kullanıcı + plan taşıyan, HMAC-SHA256 imzalı ve 48 saat geçerli bir belirteç alır. Adres
 * `https://cortexplus.app/veli-odeme/<belirteç>`; veli hesap açmadan sözleşmeleri onaylayıp PayTR iFrame'inde öder,
 * geri çağrı paketi öğrencinin hesabına yazar. İstek kaydı `parent_payment_requests` (öğrenci, plan, "link").
 * Eski `/api/payments/parent-link` adresi bu işleyiciyi kullanır.
 */
export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "parent-pay-link", limit: 5, dailyLimit: 20 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");
  if (!isPaytrConfigured()) return NextResponse.json({ error: "Ödeme altyapısı henüz yapılandırılmadı." }, { status: 503 });

  const { data: plan } = await service
    .from("plans")
    .select("id, name, price_try, billing_period, tier")
    .eq("id", parsed.data.planId)
    .eq("active", true)
    .maybeSingle();
  if (!plan || !isParentLinkPlan(plan)) return errorResponse(404, "not_found");

  const now = Date.now();
  const token = createParentPayToken({ studentId: userId, planId: plan.id as string }, now);
  if (!token) return NextResponse.json({ error: "Bağlantı imzası için anahtar tanımlı değil." }, { status: 503 });

  const url = parentPayUrl(token, appOrigin());
  const planName = parentLinkPlanName(plan);
  const text = parentShareText({ planName, url });

  await service
    .from("parent_payment_requests")
    .insert({ student_id: userId, plan_id: plan.id, status: "pending", message: "link" })
    .then(undefined, () => undefined);

  return NextResponse.json({
    url,
    token,
    planName,
    priceLabel: formatTryWhole(plan.price_try as number),
    expiresAt: new Date(now + PARENT_LINK_TTL_MS).toISOString(),
    shareText: text,
    whatsappUrl: whatsappShareUrl(text),
  });
}
