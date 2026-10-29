import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPaytrToken, generateMerchantOid } from "@/lib/payments/paytr";
import { auditLog } from "@/lib/audit";

/**
 * PayTR iFrame oturumu (29 Ekim 2026'da `create-token` rotasından çıkarıldı). İki çağıran:
 * oturumlu öğrencinin/velinin kendi ödemesi ve hesapsız velinin bağlantıyla ödemesi. Ödeme satırı,
 * PayTR token isteği, düşüşte satırın `failed`e çekilmesi ve sözleşme onayının denetim kaydı burada.
 * Fiyat her zaman veritabanındaki plandan gelir.
 */
export type CheckoutPlan = { id: string; name: string; price_try: number };

export type CheckoutInput = {
  /** Ödeme satırının sahibi (öğrenci; hesapsız veli ödemesinde de öğrenci). */
  userId: string;
  /** Hakkın tanımlandığı hesap. */
  beneficiaryId: string;
  plan: CheckoutPlan;
  email: string;
  userIp: string;
  userName: string;
  productName: string;
  okUrl: string;
  failUrl: string;
  /** Denetim kaydı: kim başlattı ve nasıl. */
  actorId: string;
  via: "self" | "parent_account" | "parent_link";
};

export type CheckoutResult =
  | { ok: true; merchantOid: string; iframeUrl: string }
  | { ok: false; status: 500 | 502; error: string };

export async function createPaytrCheckout(service: SupabaseClient, input: CheckoutInput): Promise<CheckoutResult> {
  const merchantOid = generateMerchantOid();
  const { error: insertError } = await service.from("payments").insert({
    user_id: input.userId,
    beneficiary_user_id: input.beneficiaryId,
    plan_id: input.plan.id,
    merchant_oid: merchantOid,
    amount_try: input.plan.price_try,
    status: "pending",
  });
  if (insertError) return { ok: false, status: 500, error: "generation_failed" };

  const { params } = buildPaytrToken({
    merchantOid,
    email: input.email,
    amountKurus: input.plan.price_try,
    userIp: input.userIp,
    userName: input.userName,
    productName: input.productName,
    okUrl: input.okUrl,
    failUrl: input.failUrl,
  });

  const markFailed = () => service.from("payments").update({ status: "failed" }).eq("merchant_oid", merchantOid);

  try {
    const response = await fetch("https://www.paytr.com/odeme/api/get-token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      cache: "no-store",
    });
    const payload = (await response.json()) as { status: string; token?: string; reason?: string };
    if (payload.status !== "success" || !payload.token) {
      await markFailed();
      return { ok: false, status: 502, error: "Ödeme oturumu başlatılamadı." };
    }
    await service.from("payments").update({ paytr_token: payload.token }).eq("merchant_oid", merchantOid);
    await auditLog(service, {
      actorId: input.actorId,
      action: "payment.token.created",
      entityType: "payment",
      entityId: merchantOid,
      metadata: {
        plan: input.plan.id,
        amount_try: input.plan.price_try,
        beneficiary: input.beneficiaryId,
        via: input.via,
        /*
          Sözleşmenin kurulduğunun kanıtı. Banka ya da tüketici itirazında sorulan şey tam olarak bu:
          "tüketici sözleşmeyi ne zaman kabul etti?" Kaydı ödeme başlarken tutuyoruz çünkü onay o anda alınıyor.
        */
        legal_consent: {
          accepted: true,
          at: new Date().toISOString(),
          ip: input.userIp,
          documents: ["on-bilgilendirme", "mesafeli-satis"],
        },
      },
    });
    return { ok: true, merchantOid, iframeUrl: `https://www.paytr.com/odeme/guvenli/${payload.token}` };
  } catch {
    await markFailed();
    return { ok: false, status: 502, error: "Ödeme sağlayıcısına ulaşılamadı." };
  }
}

/** İstek başlığından ödeyenin IP'si (PayTR imzasına girer). */
export function requestUserIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1";
}
