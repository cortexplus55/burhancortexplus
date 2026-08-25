import { Suspense } from "react";
import { AstraSubscriptionCards } from "@/components/parity/astra-subscription-cards";
import { ParentPaymentRequests } from "@/components/parent/parent-payment-requests";
import { requireParent } from "@/lib/auth/session";

export const metadata = { title: "Plus" };

export default async function VeliPlusPage() {
  const { supabase } = await requireParent();

  const [{ data: plans }, { data: requests }] = await Promise.all([
    supabase
      .from("plans")
      .select("id, name, description, price_try, credit_amount, is_premium")
      .eq("active", true)
      .order("sort_order"),
    supabase
      .from("parent_payment_requests")
      .select(
        "id, message, created_at, plan_id, student_id, profiles:student_id(full_name), plans(name, price_try)",
      )
      .eq("status", "pending")
      .order("created_at", { ascending: false }),
  ]);

  return (
    <Suspense fallback={<p className="p-6 text-sm">Yükleniyor…</p>}>
      <ParentPaymentRequests requests={(requests ?? []) as never} />
      <AstraSubscriptionCards plans={plans ?? []} closeHref="/veli" />
    </Suspense>
  );
}
