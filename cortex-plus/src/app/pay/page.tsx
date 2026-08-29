import Link from "next/link";
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
    <AppShell title="Plus" accountStrip={false}>
      <div className="pb-4 pt-1">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[var(--astra-primary)]">
          Plus
        </p>
        <h1 className="mt-2 text-xl font-bold tracking-tight">
          Sınava daha güçlü hazırlan
        </h1>
        <p className="mt-2 text-sm text-[var(--astra-muted)]">
          Daha gelişmiş AI, daha yüksek günlük limit ve öncelikli destek — hepsi
          tek planda.
        </p>
      </div>
      <AstraSubscriptionCards plans={plans ?? []} embedded />
      <p className="mt-6 text-center text-xs text-[var(--astra-muted)]">
        <Link href="/ogretmen" className="underline underline-offset-2">
          Ücretsiz planda devam et
        </Link>
      </p>
    </AppShell>
  );
}
