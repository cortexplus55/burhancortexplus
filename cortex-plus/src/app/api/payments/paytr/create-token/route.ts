import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import {
  buildPaytrToken,
  generateMerchantOid,
  isPaytrConfigured,
} from "@/lib/payments/paytr";
import { resolveCheckoutBeneficiary } from "@/lib/payments/beneficiary";
import { auditLog } from "@/lib/audit";

const bodySchema = z.object({
  planId: z.string().uuid(),
  studentId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "paytr-token", limit: 10 });
  if (!guard.ok) return guard.response;
  const { userId, email, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");

  // Price always comes from the database, never from the client payload.
  const { data: plan } = await service
    .from("plans")
    .select("id, name, price_try, credit_amount")
    .eq("id", parsed.data.planId)
    .eq("active", true)
    .maybeSingle();

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

  const merchantOid = generateMerchantOid();
  const { error: insertError } = await service.from("payments").insert({
    user_id: userId,
    beneficiary_user_id: beneficiary.beneficiaryId,
    plan_id: plan.id,
    merchant_oid: merchantOid,
    amount_try: plan.price_try,
    status: "pending",
  });

  if (insertError) return errorResponse(500, "generation_failed");

  const origin = new URL(request.url).origin;
  const forwarded = request.headers.get("x-forwarded-for");
  const userIp = forwarded?.split(",")[0]?.trim() ?? "127.0.0.1";
  const forChild = beneficiary.beneficiaryId !== userId;
  const returnQuery = forChild ? "?kaynak=veli" : "";

  const { params } = buildPaytrToken({
    merchantOid,
    email: email ?? "kullanici@cortexplus.app",
    amountKurus: plan.price_try,
    userIp,
    userName: profile?.full_name?.trim() || "Cortex Plus kullanicisi",
    productName: forChild ? `${plan.name} (cocuk kotasi)` : plan.name,
    okUrl: `${origin}/odeme/basarili${returnQuery}`,
    failUrl: `${origin}/odeme/basarisiz${returnQuery}`,
  });

  try {
    const response = await fetch("https://www.paytr.com/odeme/api/get-token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      cache: "no-store",
    });

    const payload = (await response.json()) as {
      status: string;
      token?: string;
      reason?: string;
    };

    if (payload.status !== "success" || !payload.token) {
      await service
        .from("payments")
        .update({ status: "failed" })
        .eq("merchant_oid", merchantOid);
      return NextResponse.json(
        { error: "Ödeme oturumu başlatılamadı." },
        { status: 502 },
      );
    }

    await service
      .from("payments")
      .update({ paytr_token: payload.token })
      .eq("merchant_oid", merchantOid);

    await auditLog(service, {
      actorId: userId,
      action: "payment.token.created",
      entityType: "payment",
      entityId: merchantOid,
      metadata: {
        plan: plan.id,
        amount_try: plan.price_try,
        beneficiary: beneficiary.beneficiaryId,
      },
    });

    return NextResponse.json({
      merchantOid,
      iframeUrl: `https://www.paytr.com/odeme/guvenli/${payload.token}`,
    });
  } catch {
    await service
      .from("payments")
      .update({ status: "failed" })
      .eq("merchant_oid", merchantOid);
    return NextResponse.json(
      { error: "Ödeme sağlayıcısına ulaşılamadı." },
      { status: 502 },
    );
  }
}
