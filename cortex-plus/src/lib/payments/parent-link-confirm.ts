import type { SupabaseClient } from "@supabase/supabase-js";
import { parentLinkPlanName } from "@/lib/payments/parent-link-plan";
import { notifyInApp } from "@/lib/notifications/in-app";

/** Öğrencinin bildirim başlığı: velisi bağlantıdan ödedi, paket hesabında (Faz 5 §2). */
export const PARENT_LINK_PAID_TITLE = "Velin ödemeyi onayladı 🎉";

export function parentLinkPaidBody(planName: string): string {
  return `${planName} paketin hesabına tanımlandı. Hazırlığına kaldığın yerden devam edebilirsin.`;
}

type PaymentRow = {
  user_id?: string | null;
  plan_id?: string | null;
  status?: string | null;
  plans?: { name?: string | null; billing_period?: string | null; tier?: string | null } | null;
};

/**
 * Veli bağlantısıyla gelen ödeme kesinleşince (PayTR geri çağrısı `completed`): bekleyen "link" isteği "paid" olur ve
 * öğrenciye uygulama içi bildirim düşer. Hak zaten `finalize_paytr_payment` ile öğrencinin hesabına yazıldı; bu iş
 * yalnız onayı görünür kılar. Ödeme veli yolundan değilse hiçbir şey yapmaz. Düşerse ödeme etkilenmez.
 */
export async function confirmParentLinkPayment(service: SupabaseClient, merchantOid: string): Promise<boolean> {
  const { data: audit } = await service
    .from("audit_logs")
    .select("metadata")
    .eq("action", "payment.token.created")
    .eq("entity_id", merchantOid)
    .limit(1)
    .maybeSingle();
  if ((audit?.metadata as { via?: string } | null)?.via !== "parent_link") return false;

  const { data } = await service
    .from("payments")
    .select("user_id, plan_id, status, plans(name, billing_period, tier)")
    .eq("merchant_oid", merchantOid)
    .maybeSingle();
  const row = data as PaymentRow | null;
  if (!row?.user_id || row.status !== "paid") return false;

  await service
    .from("parent_payment_requests")
    .update({ status: "paid", resolved_at: new Date().toISOString() })
    .eq("student_id", row.user_id)
    .eq("plan_id", row.plan_id ?? "")
    .eq("status", "pending")
    .eq("message", "link");

  await notifyInApp(service, {
    kind: "payment",
    userId: row.user_id,
    title: PARENT_LINK_PAID_TITLE,
    body: parentLinkPaidBody(parentLinkPlanName(row.plans ?? {})),
  });
  return true;
}
