import { AppShell } from "@/components/layout/app-shell";
import { AdminTable } from "@/components/admin/admin-table";
import { requireAdmin } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { formatDate, formatTry } from "@/lib/format";

export const metadata = { title: "Ödemeler" };

export default async function AdminOdemelerPage() {
  await requireAdmin();
  const service = createServiceClient();

  const [{ data: payments }, { data: events }] = await Promise.all([
    service
      .from("payments")
      .select("merchant_oid, amount_try, status, created_at")
      .order("created_at", { ascending: false })
      .limit(50),
    service
      .from("payment_webhook_events")
      .select("merchant_oid, status, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return (
    <AppShell variant="admin" title="Ödemeler">
      <div className="space-y-6">
        <AdminTable
          columns={["Sipariş", "Tutar", "Durum", "Tarih"]}
          rows={(payments ?? []).map((payment) => [
            payment.merchant_oid,
            formatTry(payment.amount_try),
            payment.status,
            formatDate(payment.created_at),
          ])}
        />

        <section>
          <h2 className="mb-2 font-medium">Callback olayları</h2>
          <AdminTable
            columns={["Sipariş", "Durum", "Tarih"]}
            rows={(events ?? []).map((event) => [
              event.merchant_oid,
              event.status,
              formatDate(event.created_at),
            ])}
            emptyMessage="Henüz callback kaydı yok."
          />
        </section>
      </div>
    </AppShell>
  );
}
