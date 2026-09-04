import { AppShell } from "@/components/layout/app-shell";
import { AstraSubscriptionCards } from "@/components/parity/astra-subscription-cards";
import { requireUser } from "@/lib/auth/session";
import { getSubscriptionBadge } from "@/lib/student/subscription-badge";

export const metadata = { title: "Plus" };

/** Astra `/pay` — uygulama içi Plus satın alma (checkout altyapısı /paketler ile aynı). */
export default async function PayPage() {
  const { supabase, user } = await requireUser();

  const [{ data: plans }, currentBadge] = await Promise.all([
    supabase
      .from("plans")
      .select("id, name, description, price_try, credit_amount, is_premium")
      .eq("active", true)
      .order("sort_order"),
    getSubscriptionBadge(supabase, user.id),
  ]);

  return (
    <AppShell>
      <AstraSubscriptionCards
        plans={plans ?? []}
        embedded
        headingLevel="h1"
        currentBadge={currentBadge}
      />
    </AppShell>
  );
}
