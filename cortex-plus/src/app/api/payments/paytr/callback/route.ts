import crypto from "crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyPaytrCallbackHash } from "@/lib/payments/paytr";
import { auditLog } from "@/lib/audit";

const OK = () => new Response("OK", { status: 200 });
const RETRY = () => new Response("RETRY", { status: 500 });
const INVALID = () => new Response("INVALID", { status: 400 });

type FinalizeResult = {
  result?: string;
  payment_id?: string;
  payer_id?: string;
  beneficiary_id?: string;
  credits?: number;
};

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return INVALID();
  }

  const merchantOid = String(form.get("merchant_oid") ?? "");
  const status = String(form.get("status") ?? "");
  const totalAmount = String(form.get("total_amount") ?? "");
  const hash = String(form.get("hash") ?? "");

  if (!merchantOid || !hash) return INVALID();
  if (!verifyPaytrCallbackHash({ merchantOid, status, totalAmount, hash })) {
    return INVALID();
  }

  const payloadHash = crypto
    .createHash("sha256")
    .update(`${merchantOid}:${status}:${totalAmount}`)
    .digest("hex");
  const rawPayload = Object.fromEntries(
    [...form.entries()].filter(([key]) => key !== "hash").map(([key, value]) => [
      key,
      typeof value === "string" ? value : value.name,
    ]),
  );

  const service = createServiceClient();
  const { data, error } = await service.rpc("finalize_paytr_payment", {
    p_merchant_oid: merchantOid,
    p_payload_hash: payloadHash,
    p_status: status,
    p_raw_payload: rawPayload,
  });

  // PayTR retries non-OK responses. The database function is transactional, so
  // a retry can safely resume after any database error.
  if (error) return RETRY();

  const result = (data ?? {}) as FinalizeResult;
  if (result.result === "completed" && result.payer_id) {
    await auditLog(service, {
      actorId: result.payer_id,
      action: "payment.completed",
      entityType: "payment",
      entityId: merchantOid,
      metadata: {
        payment_id: result.payment_id ?? null,
        beneficiary: result.beneficiary_id ?? null,
        credits: result.credits ?? 0,
      },
    });
  }

  return OK();
}
