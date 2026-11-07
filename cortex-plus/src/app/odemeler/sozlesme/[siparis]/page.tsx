import { notFound } from "next/navigation";
import { LegalDocument } from "@/components/layout/legal-document";
import { requireUser } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { purchaseContractSections } from "@/lib/payments/purchase-contract";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sözleşme örneği" };

/**
 * Satın almanın sözleşme örneği (7 Kasım 2026, uyum paketi): satın alma bilgileri + Ön Bilgilendirme Formu +
 * Mesafeli Satış Sözleşmesi. Yalnız ödemenin sahibi ya da hakkın tanımlandığı öğrenci açar; başkasının sipariş
 * numarası 404.
 */
export default async function SozlesmeOrnegiPage({ params }: { params: Promise<{ siparis: string }> }) {
  const { user } = await requireUser();
  const { siparis } = await params;
  const merchantOid = decodeURIComponent(siparis).slice(0, 80);

  const { data } = await createServiceClient()
    .from("payments")
    .select("user_id, beneficiary_user_id, amount_try, created_at, status, plans(name)")
    .eq("merchant_oid", merchantOid)
    .maybeSingle();
  const row = data as {
    user_id: string | null;
    beneficiary_user_id: string | null;
    amount_try: number | null;
    created_at: string | null;
    status: string | null;
    plans: { name?: string | null } | { name?: string | null }[] | null;
  } | null;
  if (!row || (row.user_id !== user.id && row.beneficiary_user_id !== user.id)) notFound();
  if (row.status !== "paid" && row.status !== "refunded") notFound();

  const plan = Array.isArray(row.plans) ? row.plans[0] : row.plans;
  const sections = purchaseContractSections({
    merchantOid,
    planName: plan?.name?.trim() || "Cortex Plus",
    amountKurus: Number(row.amount_try ?? 0),
    at: row.created_at ?? "",
  });

  return (
    <LegalDocument
      title="Sözleşme örneği"
      description="Bu satın almaya ait Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi."
      sections={sections}
    />
  );
}
