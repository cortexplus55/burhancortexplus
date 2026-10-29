import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { isPaytrConfigured } from "@/lib/payments/paytr";
import { resolveCheckoutBeneficiary } from "@/lib/payments/beneficiary";
import { billingPeriodOf } from "@/lib/payments/subscription";
import { createPaytrCheckout, requestUserIp } from "@/lib/payments/checkout";

const bodySchema = z.object({
  planId: z.string().uuid(),
  /*
    Mesafeli Sözleşmeler Yönetmeliği m.5: tüketici siparişten ÖNCE ön
    bilgilendirmeyi aldığını ve sözleşmeyi kabul ettiğini teyit etmeli.

    Sunucu bunu ayrıca doğruluyor. Onayı yalnızca arayüzde tutmak yetmez:
    istek doğrudan da atılabilir ve o zaman sözleşme kurulmamış olur. Bu uç
    ödemeyi BAŞLATAN yer, dolayısıyla teyidin son duracağı yer burası.
  */
  legalAccepted: z.literal(true),
  studentId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "paytr-token", limit: 10 });
  if (!guard.ok) return guard.response;
  const { userId, email, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    // Onaysız istek geçersiz girdi değil, EKSİK ONAY; ayırt edilebilir olsun
    // ki arayüz doğru mesajı gösterebilsin.
    const noConsent = parsed.error?.issues.some((i) =>
      i.path.includes("legalAccepted"),
    );
    return errorResponse(400, noConsent ? "legal_consent_required" : "invalid_input");
  }

  // Price always comes from the database, never from the client payload.
  const { data: extendedPlan, error: extendedPlanError } = await service
    .from("plans")
    .select(
      "id, name, price_try, credit_amount, is_premium, billing_period, period_days, tier",
    )
    .eq("id", parsed.data.planId)
    .eq("active", true)
    .maybeSingle();

  let plan = extendedPlan;
  if (extendedPlanError) {
    const { data: legacyPlan } = await service
      .from("plans")
      .select("id, name, price_try, credit_amount, is_premium")
      .eq("id", parsed.data.planId)
      .eq("active", true)
      .maybeSingle();
    plan = legacyPlan
      ? { ...legacyPlan, billing_period: null, period_days: null, tier: null }
      : null;
  }

  if (!plan) return errorResponse(404, "not_found");

  if (!isPaytrConfigured()) {
    return NextResponse.json(
      { error: "Ödeme altyapısı henüz yapılandırılmadı." },
      { status: 503 },
    );
  }

  const { data: profile } = await service
    .from("profiles")
    .select("primary_role, full_name")
    .eq("id", userId)
    .maybeSingle();

  const beneficiary = resolveCheckoutBeneficiary({
    payerId: userId,
    payerRole: profile?.primary_role as string | null,
    studentId: parsed.data.studentId,
  });

  if (!beneficiary.ok) {
    if (beneficiary.code === "child_required") {
      return NextResponse.json(
        { error: "Plus’ı hangi çocuk için alacağını seç." },
        { status: 400 },
      );
    }
    return errorResponse(403, "forbidden");
  }

  if (beneficiary.beneficiaryId !== userId) {
    const { data: link } = await service
      .from("parent_student_links")
      .select("id")
      .eq("parent_id", userId)
      .eq("student_id", beneficiary.beneficiaryId)
      .eq("status", "active")
      .maybeSingle();
    if (!link) return errorResponse(403, "forbidden");
  }

  const origin = new URL(request.url).origin;
  const userIp = requestUserIp(request);
  const forChild = beneficiary.beneficiaryId !== userId;
  const returnQuery = forChild ? "?kaynak=veli" : "";

  // PayTR sepet adi Turkce karakter kaldirmiyor; donem etiketi ASCII yazilir.
  const period = billingPeriodOf(plan);
  const periodSuffix =
    period === "yearly" ? " yillik" : period === "monthly" ? " aylik" : "";
  const productName = `${plan.name}${periodSuffix}${forChild ? " (cocuk kotasi)" : ""}`;

  /*
    Ödeme satırı, PayTR token isteği ve sözleşme onayının denetim kaydı
    (`payment.token.created`, legal_consent) ortak kabukta: `createPaytrCheckout`.
    Hesapsız velinin bağlantıyla ödemesi de aynı kabuğu kullanır (29 Ekim 2026).
  */
  const checkout = await createPaytrCheckout(service, {
    userId,
    beneficiaryId: beneficiary.beneficiaryId,
    plan,
    email: email ?? "kullanici@cortexplus.app",
    userIp,
    userName: profile?.full_name?.trim() || "Cortex Plus kullanicisi",
    productName,
    okUrl: `${origin}/odeme/basarili${returnQuery}`,
    failUrl: `${origin}/odeme/basarisiz${returnQuery}`,
    actorId: userId,
    via: forChild ? "parent_account" : "self",
  });
  if (!checkout.ok) {
    return checkout.status === 500
      ? errorResponse(500, checkout.error)
      : NextResponse.json({ error: checkout.error }, { status: 502 });
  }
  return NextResponse.json({ merchantOid: checkout.merchantOid, iframeUrl: checkout.iframeUrl });
}
