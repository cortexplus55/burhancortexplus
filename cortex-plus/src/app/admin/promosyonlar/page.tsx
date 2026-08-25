import { AppShell } from "@/components/layout/app-shell";
import { AdminTable } from "@/components/admin/admin-table";
import { requireAdmin } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Promosyonlar" };

export default async function AdminPromosyonlarPage() {
  await requireAdmin();
  const service = createServiceClient();

  const { data: codes } = await service
    .from("promo_codes")
    .select("code, credit_amount, max_redemptions, redemption_count, active, expires_at")
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <AppShell variant="admin" title="Promosyonlar">
      <AdminTable
        columns={["Kod", "Kredi", "Kullanım", "Durum", "Bitiş"]}
        rows={(codes ?? []).map((code) => [
          code.code,
          code.credit_amount,
          `${code.redemption_count}${code.max_redemptions ? ` / ${code.max_redemptions}` : ""}`,
          code.active ? "Aktif" : "Pasif",
          code.expires_at ? formatDate(code.expires_at) : "—",
        ])}
        emptyMessage="Tanımlı promosyon kodu yok."
      />
    </AppShell>
  );
}
