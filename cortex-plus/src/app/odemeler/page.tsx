import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/ui-kit/empty-state";
import { Badge } from "@/components/ui/badge";
import { getPrimaryRole, requireUser } from "@/lib/auth/session";
import { formatDate, formatTry } from "@/lib/format";
import {
  PARENT_PAYMENT_STATUS,
  formatParentPaymentAmount,
} from "@/lib/parent/profile";
import {
  childAvatarLabel,
  firstLinkedProfile,
} from "@/lib/parent/child-profile";
import { parentPlusHref } from "@/lib/parent/plus-href";

export const metadata = { title: "Ödemeler" };

const statusLabels: Record<string, string> = {
  pending: "Bekliyor",
  paid: "Tamamlandı",
  failed: "Başarısız",
  refunded: "İade edildi",
};

export default async function OdemelerPage() {
  const { supabase, user } = await requireUser();
  const role = await getPrimaryRole(user.id);
  const isParent = role === "parent";

  const { data: payments } = await supabase
    .from("payments")
    .select(
      "id, amount_try, status, created_at, merchant_oid, beneficiary_user_id, plans(name)",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);

  if (!isParent) {
    return (
      <AppShell title="Ödemeler" accountStrip={false}>
        {payments?.length ? (
          <ul className="divide-y rounded-lg border">
            {payments.map((payment) => (
              <li
                key={payment.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {(payment.plans as { name?: string } | null)?.name ??
                      "Kredi paketi"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(payment.created_at)} · {payment.merchant_oid}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span>{formatTry(payment.amount_try)}</span>
                  <Badge
                    variant={payment.status === "paid" ? "default" : "secondary"}
                  >
                    {statusLabels[payment.status] ?? payment.status}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="Henüz ödemen yok"
            description="Kredi paketlerini inceleyerek başlayabilirsin."
            actionHref="/paketler"
            actionLabel="Paketleri gör"
          />
        )}
      </AppShell>
    );
  }

  const { data: links } = await supabase
    .from("parent_student_links")
    .select(
      "student_id, profiles!parent_student_links_student_id_fkey(full_name, avatar_url)",
    )
    .eq("parent_id", user.id)
    .neq("status", "revoked");

  const names = new Map<string, { name: string; avatar: string }>();
  for (const row of links ?? []) {
    const child = firstLinkedProfile(row.profiles);
    names.set(row.student_id as string, {
      name: child?.full_name?.trim() || "Öğrenci",
      avatar: childAvatarLabel(child),
    });
  }

  return (
    <AppShell title="Ödemeler" accountStrip={false}>
      <section className="pt-2">
        <h1 className="text-xl font-semibold">Ödemeler</h1>
        <p className="mt-1 text-sm text-[var(--astra-muted)]">
          Çocuğunun Plus kotası için yaptığın ödemeler. Raporlar ücretsizdir.
        </p>
      </section>

      {payments?.length ? (
        <ul className="mt-5 space-y-3">
          {payments.map((payment) => {
            const beneficiaryId = payment.beneficiary_user_id as
              | string
              | null
              | undefined;
            const child =
              beneficiaryId && beneficiaryId !== user.id
                ? names.get(beneficiaryId)
                : null;
            const planName =
              (payment.plans as { name?: string } | null)?.name ?? "Paket";
            return (
              <li key={payment.id} className="astra-pay-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{planName}</p>
                    <p className="mt-0.5 text-xs text-[var(--astra-muted)]">
                      {child
                        ? `Kota: ${child.name}`
                        : "Kota çocuğunun hesabına yazılır"}
                      {" · "}
                      {formatDate(payment.created_at)}
                    </p>
                  </div>
                  <span
                    className={
                      payment.status === "paid"
                        ? "shrink-0 rounded-full bg-amber-500/20 px-2.5 py-1 text-[11px] font-semibold text-amber-200"
                        : "shrink-0 rounded-full border border-[var(--astra-border)] px-2.5 py-1 text-[11px] text-[var(--astra-muted)]"
                    }
                  >
                    {PARENT_PAYMENT_STATUS[payment.status] ?? payment.status}
                  </span>
                </div>
                <p className="mt-3 text-lg font-semibold">
                  {formatParentPaymentAmount(Number(payment.amount_try))}
                </p>
              </li>
            );
          })}
        </ul>
      ) : (
        <section className="astra-pay-card mt-5 p-5 text-center">
          <h2 className="font-semibold">Henüz ödeme yok</h2>
          <p className="mt-1 text-sm text-[var(--astra-muted)]">
            Plus’ı çocuğunun kotası için satın aldığında makbuzlar burada durur.
          </p>
          <Link
            href={parentPlusHref()}
            className="astra-btn-primary mt-4 flex w-full items-center justify-center rounded-full py-3 text-sm font-semibold"
          >
            Plus’a git
          </Link>
        </section>
      )}
    </AppShell>
  );
}
