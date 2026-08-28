import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
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
    <AppShell title="Plus" accountStrip={false}>
      <Suspense fallback={<p className="text-sm">Yükleniyor…</p>}>
        <AstraSubscriptionCards
          plans={plans ?? []}
          studentAskParent
          embedded
        />
      </Suspense>
    </AppShell>
  );
}
