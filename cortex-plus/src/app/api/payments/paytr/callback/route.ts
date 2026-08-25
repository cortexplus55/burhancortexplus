import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyPaytrCallbackHash } from "@/lib/payments/paytr";
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
    .select("id, user_id, status, plans(credit_amount, name)")
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

  const plan = payment.plans as { credit_amount?: number; name?: string } | null;
  const creditAmount = plan?.credit_amount ?? 0;

  await service
    .from("payments")
    .update({ status: "paid", updated_at: new Date().toISOString() })
    .eq("merchant_oid", merchantOid);

  const { data: wallet } = await service
    .from("credit_wallets")
    .select("balance")
    .eq("user_id", payment.user_id)
    .maybeSingle();

  const newBalance = (wallet?.balance ?? 0) + creditAmount;

  await service
    .from("credit_wallets")
    .update({ balance: newBalance, updated_at: new Date().toISOString() })
    .eq("user_id", payment.user_id);

  // Unique idempotency key blocks a second credit grant for the same order.
  await service.from("credit_ledger").insert({
    user_id: payment.user_id,
    delta: creditAmount,
    balance_after: newBalance,
    entry_type: "purchase",
    idempotency_key: `pay_${merchantOid}`,
    reference_id: payment.id,
    metadata: { merchant_oid: merchantOid },
  });

  await service.from("notifications").insert({
    user_id: payment.user_id,
    title: "Kredi yüklendi",
    body: `${plan?.name ?? "Paket"} için ${creditAmount} kredi hesabına tanımlandı.`,
  });

  await auditLog(service, {
    actorId: payment.user_id,
    action: "payment.completed",
    entityType: "payment",
    entityId: merchantOid,
    metadata: { credits: creditAmount },
  });

  return OK();
}
