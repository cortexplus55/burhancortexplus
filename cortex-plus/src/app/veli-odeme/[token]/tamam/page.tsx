import { ParentPayShell } from "@/components/billing/veli/parent-pay-shell";
import { ParentPayConfirm } from "@/components/billing/veli/parent-pay-confirm";
import { verifyParentPayToken } from "@/lib/payments/parent-link";
import { parentLinkPlanName } from "@/lib/payments/parent-link-plan";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Ödeme onayı", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * PayTR'nin başarılı dönüş adresi (Faz 5 §2). Ödemenin asıl onayı PayTR geri çağrısıdır; bu ekran o onayı yoklar ve
 * gelince veliye "Ödemeniz onaylandı" der. Süresi geçmiş bağlantıda da teşekkür ekranı açılır (ödeme olmuş olabilir).
 */
export default async function VeliOdemeTamamPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const verified = verifyParentPayToken(token);
  let studentFirst = "Öğrenci";
  let planName = "Plus";
  if (verified.ok) {
    const service = createServiceClient();
    const [{ data: plan }, { data: student }] = await Promise.all([
      service.from("plans").select("name, billing_period, tier").eq("id", verified.claims.planId).maybeSingle(),
      service.from("profiles").select("full_name").eq("id", verified.claims.studentId).maybeSingle(),
    ]);
    if (plan) planName = parentLinkPlanName(plan);
    studentFirst = String(student?.full_name ?? "").trim().split(/\s+/)[0] || studentFirst;
  }
  return (
    <ParentPayShell>
      <ParentPayConfirm token={verified.ok ? token : null} studentFirst={studentFirst} planName={planName} />
    </ParentPayShell>
  );
}
