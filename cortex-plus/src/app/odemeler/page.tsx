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
    .select("id, amount_try, status, created_at, merchant_oid, plans(name)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);

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
                  {(payment.plans as { name?: string } | null)?.name ?? "Kredi paketi"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(payment.created_at)} · {payment.merchant_oid}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span>{formatTry(payment.amount_try)}</span>
                <Badge variant={payment.status === "paid" ? "default" : "secondary"}>
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
