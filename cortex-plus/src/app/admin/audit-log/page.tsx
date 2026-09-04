import { AdminShell } from "@/components/admin/admin-shell";
import { AdminCard, AdminEmpty, AdminNote, AdminTableFrame } from "@/components/admin/admin-ui";
import { requireAdmin } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { countPendingApplications } from "@/lib/admin/pending";
import { auditLabel } from "@/lib/admin/labels";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Yönetim · İşlem geçmişi" };

export default async function AdminIslemGecmisiPage() {
  await requireAdmin();
  const service = createServiceClient();

  const [{ data: logs }, pending] = await Promise.all([
    service
      .from("audit_logs")
      .select("id, action, entity_type, entity_id, created_at, profiles!audit_logs_actor_id_fkey(full_name)")
      .order("created_at", { ascending: false })
      .limit(100),
    countPendingApplications(service),
  ]);

  const rows = logs ?? [];

  return (
    <AdminShell href="/admin/audit-log" pendingApplications={pending}>
      <AdminNote tone="info">
        Bu liste <strong>silinemez</strong>. Panelde yapılan her değişiklik
        buraya yazılır; bir ayarın ne zaman ve kim tarafından değiştiğini
        buradan bulursun.
      </AdminNote>

      <AdminCard title="Son 100 işlem" desc="En yeni kayıt üstte." bodyless>
        {rows.length ? (
          <AdminTableFrame columns={["Ne oldu", "Kim yaptı", "İlgili kayıt", "Ne zaman"]}>
            {rows.map((log) => {
              const actor = log.profiles as { full_name?: string } | null;
              return (
                <tr key={log.id}>
                  <td>
                    <div className="font-medium">{auditLabel(log.action)}</div>
                    <div className="text-xs text-[var(--adm-muted)]">{log.action}</div>
                  </td>
                  <td>{actor?.full_name || "Sistem"}</td>
                  <td className="text-xs text-[var(--adm-muted)]">
                    {log.entity_id ?? "—"}
                  </td>
                  <td className="adm-num text-xs text-[var(--adm-muted)]">
                    {formatDate(log.created_at)}
                  </td>
                </tr>
              );
            })}
          </AdminTableFrame>
        ) : (
          <AdminEmpty title="Henüz kayıt yok">
            Panelde ilk değişikliği yaptığında burada görünür.
          </AdminEmpty>
        )}
      </AdminCard>
    </AdminShell>
  );
}
