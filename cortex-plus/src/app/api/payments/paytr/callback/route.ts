import crypto from "crypto";
import { after } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { appOrigin } from "@/lib/app-url";
import { sendPurchaseContract } from "@/lib/payments/purchase-contract";
import { sendPurchaseMail } from "@/lib/email/lifecycle";
import { verifyPaytrCallbackHash } from "@/lib/payments/paytr";
import { auditLog } from "@/lib/audit";
import { awardInviteSubscribed } from "@/lib/stars/invite";

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

  // Kesinleşmeden sonraki yan işler (tutar denetimi, denetim kaydı, yıldız) hiçbir koşulda "OK"u
  // engellemez (6 Kasım 2026): ödeme veritabanında kesinleşti; burada düşüp 500 dönmek PayTR'nin
  // yeniden denemesine ve öğrenciye "ödeme bekliyor" görünmesine yol açardı. Düşüş günlüğe yazılır.
  if (status === "success") {
    await checkPaidAmount(service, merchantOid, totalAmount, result.payer_id ?? null);
  }

  if (result.result === "completed" && result.payer_id) {
    try {
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
    } catch (err) {
      console.error("paytr_callback_audit_failed", { merchantOid, message: errorMessage(err) });
    }
    try {
      // Yıldızlar: davet edilen abone olunca davet edene 300, bir kez (17 Ekim 2026).
      await awardInviteSubscribed(service, result.beneficiary_id ?? result.payer_id);
    } catch (err) {
      console.error("paytr_callback_stars_failed", { merchantOid, message: errorMessage(err) });
    }
    // Sözleşme örneği e-postayla (7 Kasım 2026, uyum paketi). "OK"u bekletmez; `completed` yalnız bir kez döner.
    // `after` yalnız istek içinde kurulur; rotayı doğrudan çağıran birim testinde iş atlanır.
    try {
      after(() => sendPurchaseContract(service, merchantOid, appOrigin()));
    } catch {
      /* istek dışı */
    }
    // Karşılama e-postası (8 Kasım 2026): pakete göre değişir (Plus, Sınav Haftası, Sigma, ek paket); sipariş başına bir
    // kez (PayTR aynı bildirimi yeniden gönderse de çift gitmez). Yararlanıcıya gider (veli ödemesinde öğrenciye).
    try {
      after(() => sendPurchaseMail(service, merchantOid, appOrigin()).then(() => undefined));
    } catch {
      /* istek dışı */
    }
  }

  return OK();
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * PayTR'nin bildirdiği tutar (`total_amount`, kuruş; taksitte vade farkı dahil, yani fazlası olağan)
 * kayıttaki plan tutarından AZSA alarm. Kesinleşmeyi durdurmaz: bildirim PayTR'nin HMAC'iyle
 * doğrulandı; tutar farkı ancak mağaza panelindeki bir ayar ya da kampanya olabilir, incelenmesi için
 * günlüğe ve denetim kaydına yazılır.
 */
async function checkPaidAmount(
  service: ReturnType<typeof createServiceClient>,
  merchantOid: string,
  totalAmount: string,
  actorId: string | null,
): Promise<"ok" | "mismatch" | "unknown"> {
  try {
    const paid = Number(totalAmount);
    if (!totalAmount || !Number.isFinite(paid)) return "unknown";
    const { data: row } = await service.from("payments").select("amount_try").eq("merchant_oid", merchantOid).maybeSingle();
    const expected = Number((row as { amount_try?: unknown } | null)?.amount_try);
    if (!Number.isFinite(expected) || expected <= 0) return "unknown";
    if (paid >= expected) return "ok";
    console.error("paytr_amount_mismatch", { merchantOid, expected, paid });
    try {
      await auditLog(service, {
        actorId,
        action: "payment.amount_mismatch",
        entityType: "payment",
        entityId: merchantOid,
        metadata: { expected_kurus: expected, paid_kurus: paid },
      });
    } catch (err) {
      console.error("paytr_amount_mismatch_audit_failed", { merchantOid, message: errorMessage(err) });
    }
    return "mismatch";
  } catch (err) {
    console.error("paytr_amount_check_failed", { merchantOid, message: errorMessage(err) });
    return "unknown";
  }
}
