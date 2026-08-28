import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyPaytrCallbackHash } from "@/lib/payments/paytr";
import {
  paymentWalletUserId,
  planGrantsSubscription,
} from "@/lib/payments/beneficiary";
import { auditLog } from "@/lib/audit";

/**
 * PayTR requires a plain-text "OK" for every delivered notification, otherwise
 * it keeps retrying. Failures are recorded but never surfaced to the provider.
 */
const OK = () => new Response("OK", { status: 200 });

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return OK();
  }

  const merchantOid = String(form.get("merchant_oid") ?? "");
  const status = String(form.get("status") ?? "");
  const totalAmount = String(form.get("total_amount") ?? "");
  const hash = String(form.get("hash") ?? "");

  if (!merchantOid || !hash) return OK();
  if (!verifyPaytrCallbackHash({ merchantOid, status, totalAmount, hash })) {
    return OK();
  }

  const service = createServiceClient();

  // Replay protection: the unique payload hash rejects duplicate deliveries.
  const payloadHash = crypto
    .createHash("sha256")
    .update(`${merchantOid}:${status}:${totalAmount}`)
    .digest("hex");

  const { error: duplicate } = await service
    .from("payment_webhook_events")
    .insert({
      merchant_oid: merchantOid,
      payload_hash: payloadHash,
      status,
      raw_payload: { merchant_oid: merchantOid, status, total_amount: totalAmount },
      processed_at: new Date().toISOString(),
    });

  if (duplicate) return OK();

  const { data: payment } = await service
    .from("payments")
    .select(
      "id, user_id, beneficiary_user_id, plan_id, status, plans(credit_amount, name, is_premium)",
    )
    .eq("merchant_oid", merchantOid)
    .maybeSingle();

  if (!payment) return OK();

  if (status !== "success") {
    await service
      .from("payments")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("merchant_oid", merchantOid);
    return OK();
  }

  if (payment.status === "paid") return OK();

  const plan = payment.plans as {
    credit_amount?: number;
    name?: string;
    is_premium?: boolean;
  } | null;
  const creditAmount = plan?.credit_amount ?? 0;
  const walletUserId = paymentWalletUserId(payment);
  const payerId = payment.user_id as string;
  const now = new Date().toISOString();

  await service
    .from("payments")
    .update({ status: "paid", updated_at: now })
    .eq("merchant_oid", merchantOid);

  if (creditAmount > 0) {
    const { data: wallet } = await service
      .from("credit_wallets")
      .select("balance")
      .eq("user_id", walletUserId)
      .maybeSingle();

    const newBalance = (wallet?.balance ?? 0) + creditAmount;

    if (wallet) {
      await service
        .from("credit_wallets")
        .update({ balance: newBalance, updated_at: now })
        .eq("user_id", walletUserId);
    } else {
      await service.from("credit_wallets").insert({
        user_id: walletUserId,
        balance: newBalance,
        reserved: 0,
        updated_at: now,
      });
    }

    // Unique idempotency key blocks a second credit grant for the same order.
    await service.from("credit_ledger").insert({
      user_id: walletUserId,
      delta: creditAmount,
      balance_after: newBalance,
      entry_type: "purchase",
      idempotency_key: `pay_${merchantOid}`,
      reference_id: payment.id,
      metadata: {
        merchant_oid: merchantOid,
        paid_by: payerId,
        beneficiary: walletUserId,
      },
    });
  }

  const notices: {
    user_id: string;
    title: string;
    body: string;
  }[] = [];

  if (walletUserId === payerId) {
    notices.push({
      user_id: payerId,
      title: "Kredi yüklendi",
      body: `${plan?.name ?? "Paket"} için ${creditAmount} kredi hesabına tanımlandı.`,
    });
  } else {
    notices.push({
      user_id: walletUserId,
      title: "Plus hesabına tanımlandı",
      body: `${plan?.name ?? "Paket"} kotası velin tarafından hesabına yüklendi.`,
    });
    notices.push({
      user_id: payerId,
      title: "Çocuğunun kotası açıldı",
      body: `${plan?.name ?? "Paket"} çocuğunun hesabına tanımlandı. Raporların ücretsiz kalır.`,
    });
  }

  if (notices.length) {
    await service.from("notifications").insert(notices);
  }

  if (planGrantsSubscription(plan) && payment.plan_id) {
    const periodEnd = new Date();
    periodEnd.setDate(periodEnd.getDate() + 30);

    await service
      .from("subscriptions")
      .update({ status: "inactive", updated_at: now })
      .eq("user_id", walletUserId)
      .eq("status", "active");

    const { data: existingSub } = await service
      .from("subscriptions")
      .select("id")
      .eq("user_id", walletUserId)
      .maybeSingle();

    if (existingSub?.id) {
      await service
        .from("subscriptions")
        .update({
          plan_id: payment.plan_id,
          status: "active",
          current_period_end: periodEnd.toISOString(),
          updated_at: now,
        })
        .eq("id", existingSub.id);
    } else {
      await service.from("subscriptions").insert({
        user_id: walletUserId,
        plan_id: payment.plan_id,
        status: "active",
        current_period_end: periodEnd.toISOString(),
      });
    }
  }

  if (walletUserId !== payerId) {
    await service
      .from("parent_payment_requests")
      .update({ status: "paid", resolved_at: now })
      .eq("student_id", walletUserId)
      .eq("status", "pending");
  }

  await auditLog(service, {
    actorId: payerId,
    action: "payment.completed",
    entityType: "payment",
    entityId: merchantOid,
    metadata: { credits: creditAmount, beneficiary: walletUserId },
  });

  return OK();
}
