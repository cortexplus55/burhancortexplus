import { AppShell } from "@/components/layout/app-shell";
import { AdminTable } from "@/components/admin/admin-table";
import { requireAdmin } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Audit log" };

export default async function AdminAuditLogPage() {
  await requireAdmin();
  const service = createServiceClient();

  const { data: logs } = await service
    .from("audit_logs")
    .select("action, entity_type, entity_id, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <AppShell variant="admin" title="Audit log">
      <AdminTable
        columns={["İşlem", "Nesne", "Kimlik", "Tarih"]}
        rows={(logs ?? []).map((log) => [
          log.action,
          log.entity_type ?? "—",
          log.entity_id ?? "—",
          formatDate(log.created_at),
        ])}
        emptyMessage="Henüz denetim kaydı yok."
      />
    </AppShell>
  );
}
