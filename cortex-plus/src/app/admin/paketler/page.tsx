import { AppShell } from "@/components/layout/app-shell";
import { AdminTable } from "@/components/admin/admin-table";
import { requireAdmin } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { formatTry } from "@/lib/format";

export const metadata = { title: "Paketler" };

export default async function AdminPaketlerPage() {
  await requireAdmin();
  const service = createServiceClient();

  const { data: plans } = await service
    .from("plans")
    .select("slug, name, price_try, credit_amount, is_premium, active")
    .order("sort_order");

  return (
    <AppShell variant="admin" title="Paketler">
      <AdminTable
        columns={["Paket", "Slug", "Fiyat", "Kredi", "Premium", "Durum"]}
        rows={(plans ?? []).map((plan) => [
          plan.name,
          plan.slug,
          formatTry(plan.price_try),
          plan.credit_amount,
          plan.is_premium ? "Evet" : "Hayır",
          plan.active ? "Aktif" : "Pasif",
        ])}
      />
    </AppShell>
  );
}
