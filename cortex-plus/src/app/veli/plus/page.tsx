import Link from "next/link";
import { Suspense } from "react";
import { AstraSubscriptionCards } from "@/components/parity/astra-subscription-cards";
import { ParentPaymentRequests } from "@/components/parent/parent-payment-requests";
import { ParentShell } from "@/components/layout/parent-shell";
import { requireParent } from "@/lib/auth/session";
import { getParentLinkStatus } from "@/lib/parent/link-status";

export const metadata = { title: "Plus" };

export default async function VeliPlusPage() {
  const { supabase, user } = await requireParent();
  const linkStatus = await getParentLinkStatus(supabase, user.id);

  if (!linkStatus.hasActiveChild) {
    return (
      <ParentShell title="Plus">
        <section className="astra-pay-card mt-4 p-5">
          <h1 className="font-semibold">Plus henüz kapalı</h1>
          <p className="mt-2 text-sm text-[var(--astra-muted)]">
            Öğrenci bağlantı isteğini onayladıktan sonra Plus’ı onun hesabı
            için satın alabilirsin. Raporlar da onay sonrası açılır.
          </p>
          <Link
            href="/veli"
            className="astra-btn-primary mt-4 flex w-full items-center justify-center rounded-full py-3 text-sm font-semibold"
          >
            Çocuklarım
          </Link>
        </section>
      </ParentShell>
    );
  }

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
