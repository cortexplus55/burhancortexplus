import { AdminShell } from "@/components/admin/admin-shell";
import { AdminCard, AdminEmpty, AdminNote, AdminTableFrame } from "@/components/admin/admin-ui";
import { requireAdminPage } from "@/lib/auth/admin-guard";
import { createServiceClient } from "@/lib/supabase/server";
import { countPendingApplications } from "@/lib/admin/pending";
import { AUDIT_LABELS, auditLabel, entityLabel, shortEntityId } from "@/lib/admin/labels";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Yönetim · İşlem Kayıtları" };

/*
  İşlem Kayıtları (6 Kasım 2026). Ana satır her zaman Türkçe cümle (`lib/admin/labels.ts`); eylem kodu ve kayıt
  kimliği yalnız küçük ikincil yazıda. Etiketi olmayan bir eylem "Tanımlanmamış işlem" yazar (bekçi kaynaktaki
  bütün eylemlerin etiketini arar).
*/

type LogRow = {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
  profiles: { full_name?: string | null } | null;
};

export default async function AdminIslemKayitlariPage() {
  await requireAdminPage();
  const service = createServiceClient();

  const [{ data: logs }, pending] = await Promise.all([
    service
      .from("audit_logs")
      .select("id, action, entity_type, entity_id, created_at, profiles!audit_logs_actor_id_fkey(full_name)")
      .order("created_at", { ascending: false })
      .limit(100),
    countPendingApplications(service),
  ]);

  const rows = (logs ?? []) as unknown as LogRow[];
  const unlabeled = new Set(rows.map((row) => row.action).filter((action) => !AUDIT_LABELS[action]));

  return (
    <AdminShell href="/admin/audit-log" pendingApplications={pending}>
      <AdminNote tone="info">
        Bu liste <strong>silinemez</strong>. Panelde yapılan her değişiklik ve sistemin kendi önemli işleri (ödeme,
        kod kullanımı, günlük özet) buraya yazılır; bir ayarın ne zaman ve kim tarafından değiştiğini buradan bulursun.
        Kişi adı yoksa işi sistem yapmıştır.
      </AdminNote>

      {unlabeled.size ? (
        <AdminNote tone="warn">
          {unlabeled.size} işlem türünün Türkçe adı henüz yok; satırda &quot;Tanımlanmamış işlem&quot; yazıyor. Bu işlemlerin Türkçe adının
          koda eklenmesi gerekiyor.
        </AdminNote>
      ) : null}

      <AdminCard title="Son 100 işlem" desc="En yeni kayıt üstte." bodyless>
        {rows.length ? (
          <AdminTableFrame columns={["Ne oldu", "Kim yaptı", "İlgili kayıt", "Ne zaman"]}>
            {rows.map((log) => (
              <tr key={log.id}>
                <td>
                  {/* Ham eylem kodu ekranda değil, yalnız ipucunda (geliştirici için). */}
                  <div className="font-medium" title={log.action}>
                    {auditLabel(log.action)}
                  </div>
                </td>
                <td>{log.profiles?.full_name || "Sistem"}</td>
                <td>
                  <div className="text-sm">{entityLabel(log.entity_type)}</div>
                  {log.entity_id ? (
                    <div className="text-xs text-[var(--adm-muted)]" title={log.entity_id}>
                      {shortEntityId(log.entity_id)}
                    </div>
                  ) : null}
                </td>
                <td className="adm-num text-xs text-[var(--adm-muted)]">{formatDate(log.created_at)}</td>
              </tr>
            ))}
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
