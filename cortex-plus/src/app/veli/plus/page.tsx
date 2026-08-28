import { Suspense } from "react";
import Link from "next/link";
import { AstraSubscriptionCards } from "@/components/parity/astra-subscription-cards";
import { ParentPaymentRequests } from "@/components/parent/parent-payment-requests";
import { ParentPlusChildPicker } from "@/components/parent/parent-plus-child-picker";
import { ParentPlusStatus } from "@/components/parent/parent-plus-status";
import { ParentShell } from "@/components/layout/parent-shell";
import { requireParent } from "@/lib/auth/session";
import { getParentLinkStatus } from "@/lib/parent/link-status";
import { listParentPlusChildren } from "@/lib/parent/plus-children";

export const metadata = { title: "Plus" };

export default async function VeliPlusPage({
  searchParams,
}: {
  searchParams: Promise<{ ogrenci?: string }>;
}) {
  const { ogrenci } = await searchParams;
  const { supabase, user } = await requireParent();
  const [linkStatus, children] = await Promise.all([
    getParentLinkStatus(supabase, user.id),
    listParentPlusChildren(user.id),
  ]);

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

  const selected =
    children.find((child) => child.studentId === ogrenci) ?? children[0] ?? null;

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

  const showCheckout = selected && selected.planBadge !== "Sigma";

  return (
    <ParentShell title="Plus">
      <section className="pt-2">
        <h1 className="text-xl font-semibold">Çocuğunun kotasını aç</h1>
        <p className="mt-1 text-sm text-[var(--astra-muted)]">
          Raporlar ücretsiz. Plus ve Sigma, çocuğunun AI, deneme ve quiz
          hakkına gider. Ödemeyi sen yaparsın.
        </p>
      </section>

      <ParentPlusChildPicker
        options={children}
        selectedId={selected?.studentId ?? ""}
      />

      {selected ? <ParentPlusStatus child={selected} /> : null}

      <ParentPaymentRequests requests={(requests ?? []) as never} />

      {showCheckout && selected ? (
        <Suspense fallback={<p className="mt-4 text-sm">Yükleniyor…</p>}>
          <AstraSubscriptionCards
            plans={plans ?? []}
            embedded
            audience="parent"
            beneficiaryStudentId={selected.studentId}
            childName={selected.name}
            currentBadge={selected.planBadge}
            closeHref="/veli"
          />
        </Suspense>
      ) : null}

      {selected?.planBadge === "Sigma" ? (
        <p className="mt-4 text-center text-xs text-[var(--astra-muted)]">
          Bu çocukta en yüksek paket açık. Yeni bir paket almana gerek yok.
        </p>
      ) : null}
    </ParentShell>
  );
}
