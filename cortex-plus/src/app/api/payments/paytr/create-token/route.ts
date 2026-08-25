import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import {
  buildPaytrToken,
  generateMerchantOid,
  isPaytrConfigured,
} from "@/lib/payments/paytr";
import { auditLog } from "@/lib/audit";

const bodySchema = z.object({ planId: z.string().uuid() });

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

  const merchantOid = generateMerchantOid();
  const { error: insertError } = await service.from("payments").insert({
    user_id: userId,
    plan_id: plan.id,
    merchant_oid: merchantOid,
    amount_try: plan.price_try,
    status: "pending",
  });

  if (insertError) return errorResponse(500, "generation_failed");

  const origin = new URL(request.url).origin;
  const forwarded = request.headers.get("x-forwarded-for");
  const userIp = forwarded?.split(",")[0]?.trim() ?? "127.0.0.1";

  const { params } = buildPaytrToken({
    merchantOid,
    email: email ?? "kullanici@cortexplus.app",
    amountKurus: plan.price_try,
    userIp,
    userName: "Cortex Plus kullanicisi",
    productName: plan.name,
    okUrl: `${origin}/odeme/basarili`,
    failUrl: `${origin}/odeme/basarisiz`,
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
      metadata: { plan: plan.id, amount_try: plan.price_try },
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
