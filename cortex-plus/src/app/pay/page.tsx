import { AppShell } from "@/components/layout/app-shell";
import { AstraSubscriptionCards } from "@/components/parity/astra-subscription-cards";
import { requireUser } from "@/lib/auth/session";

export const metadata = { title: "Plus" };

/** Astra `/pay` — uygulama içi Plus satın alma (checkout altyapısı /paketler ile aynı). */
export default async function PayPage() {
  const { supabase } = await requireUser();

  const { data: plans } = await supabase
    .from("plans")
    .select("id, name, description, price_try, credit_amount, is_premium")
    .eq("active", true)
    .order("sort_order");

  return (
    <AppShell accountStrip={false}>
      <AstraSubscriptionCards plans={plans ?? []} embedded />
    </AppShell>
  );
}
