import { Suspense } from "react";
import { AstraSubscriptionCards } from "@/components/parity/astra-subscription-cards";
import { requireUser } from "@/lib/auth/session";

export const metadata = { title: "Paketler" };

export default async function PaketlerPage() {
  const { supabase } = await requireUser();

  const { data: plans } = await supabase
    .from("plans")
    .select("id, name, description, price_try, credit_amount, is_premium")
    .eq("active", true)
    .order("sort_order");

  return (
    <Suspense fallback={<p className="p-6 text-sm">Yükleniyor…</p>}>
      <AstraSubscriptionCards plans={plans ?? []} studentAskParent />
    </Suspense>
  );
}
