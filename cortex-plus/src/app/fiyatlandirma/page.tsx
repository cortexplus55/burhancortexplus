import Link from "next/link";
import { Suspense } from "react";
import { AstraMarketingPage } from "@/components/parity/astra-marketing";
import { AstraSubscriptionCards } from "@/components/parity/astra-subscription-cards";
import { createClient } from "@/lib/supabase/server";

export const metadata = {
  title: "Fiyatlandırma",
  description: "Cortex Plus Plus ve Sigma paketleri.",
};

export default async function FiyatlandirmaPage() {
  let plans: {
    id: string;
    name: string;
    description: string | null;
    price_try: number;
    credit_amount: number;
    is_premium: boolean;
  }[] = [];

  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("plans")
      .select("id, name, description, price_try, credit_amount, is_premium")
      .eq("active", true)
      .order("sort_order");
    plans = data ?? [];
  } catch {
    plans = [];
  }

  return (
    <AstraMarketingPage
      title="Fiyatlandırma"
      description="Plus ve Sigma paketleri — gelişmiş AI modeli ve yüksek kredi kotası."
    >
      <div data-cinematic-reveal>
        <Suspense fallback={null}>
          <AstraSubscriptionCards plans={plans} guestMode />
        </Suspense>
      </div>
      <p className="pb-8 text-center text-sm text-[var(--mk-muted)]">
        Zaten hesabın var mı?{" "}
        <Link href="/giris" className="text-[var(--mk-primary)] underline">
          Giriş yap
        </Link>
      </p>
    </AstraMarketingPage>
  );
}
