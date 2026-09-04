import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/ui-kit/empty-state";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth/session";
import { formatDate, formatTry } from "@/lib/format";

export const metadata = { title: "Ödemeler" };

const statusLabels: Record<string, string> = {
  pending: "Bekliyor",
  paid: "Tamamlandı",
  failed: "Başarısız",
  refunded: "İade edildi",
};

export default async function OdemelerPage() {
  const { supabase, user } = await requireUser();

  const { data: payments } = await supabase
    .from("payments")
    .select(
      "id, amount_try, status, created_at, merchant_oid, plans(name)",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);

  return (
    <AppShell title="Ödemeler">
      {payments?.length ? (
        <ul className="cortex-premium-inset-list divide-y">
          {payments.map((payment) => (
            <li
              key={payment.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
            >
              <div>
                <p className="font-medium text-[var(--astra-text)]">
                  {(payment.plans as { name?: string } | null)?.name ??
                    "Kredi paketi"}
                </p>
                <p className="text-xs text-[var(--astra-muted)]">
                  {formatDate(payment.created_at)} · {payment.merchant_oid}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-medium">{formatTry(payment.amount_try)}</span>
                <Badge
                  variant={payment.status === "paid" ? "default" : "secondary"}
                  className={
                    payment.status === "paid"
                      ? "border-amber-500/30 bg-amber-500/15 text-amber-100"
                      : undefined
                  }
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
          description="Plus veya kredi paketi satın aldığında makbuzlar burada görünür."
          actionHref="/pay"
          actionLabel="Plus planları"
        />
      )}
    </AppShell>
  );
}
