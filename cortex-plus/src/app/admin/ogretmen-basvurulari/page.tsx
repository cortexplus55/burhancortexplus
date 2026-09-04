import { AdminShell } from "@/components/admin/admin-shell";
import { AdminBadge, AdminCard, AdminEmpty, AdminNote, AdminTableFrame } from "@/components/admin/admin-ui";
import { ApplicationReview } from "@/components/admin/application-review";
import { requireAdmin } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { countPendingApplications } from "@/lib/admin/pending";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Yönetim · Öğretmen başvuruları" };

const STATUS = {
  approved: { label: "Onaylandı", tone: "ok" },
  rejected: { label: "Reddedildi", tone: "bad" },
  pending: { label: "Bekliyor", tone: "warn" },
} as const;

export default async function OgretmenBasvurulariPage() {
  await requireAdmin();
  const service = createServiceClient();

  const { data: applications } = await service
    .from("teacher_applications")
    .select("id, institution, status, created_at, notes, profiles!teacher_applications_user_id_fkey(full_name)")
    .order("created_at", { ascending: false })
    .limit(50);

  const all = applications ?? [];
  const pending = all.filter((item) => item.status === "pending");
  const resolved = all.filter((item) => item.status !== "pending");
  const name = (row: (typeof all)[number]) =>
    (row.profiles as { full_name?: string } | null)?.full_name || "İsimsiz kullanıcı";

  return (
    <AdminShell href="/admin/ogretmen-basvurulari" pendingApplications={pending.length}>
      <AdminNote tone="info">
        Onayladığın kişi öğretmen özelliklerini kullanmaya başlar. Karar
        verdikten sonra bu listeden aşağıya, sonuçlananlara iner — kararı geri
        almak için kişiyi <strong>Kullanıcılar</strong> sayfasından
        düzenleyebilirsin.
      </AdminNote>

      <AdminCard
        title="Cevap bekleyenler"
        desc={
          pending.length
            ? `${pending.length} başvuru senden karar bekliyor.`
            : "Şu an bekleyen başvuru yok."
        }
        bodyless
      >
        {pending.length ? (
          <AdminTableFrame columns={["Kişi", "Kurum", "Başvuru", "Karar"]}>
            {pending.map((application) => (
              <tr key={application.id}>
                <td className="font-medium">{name(application)}</td>
                <td>{application.institution || "Kurum belirtilmedi"}</td>
                <td className="adm-num text-xs text-[var(--adm-muted)]">
                  {formatDate(application.created_at)}
                </td>
                <td>
                  <ApplicationReview applicationId={application.id} />
                </td>
              </tr>
            ))}
          </AdminTableFrame>
        ) : (
          <AdminEmpty title="Bekleyen başvuru yok">
            Yeni bir başvuru geldiğinde hem burada hem soldaki menüde sayısıyla
            birlikte görünür.
          </AdminEmpty>
        )}
      </AdminCard>

      {resolved.length ? (
        <AdminCard
          title="Sonuçlananlar"
          desc="Daha önce karar verdiğin başvurular."
          bodyless
        >
          <AdminTableFrame columns={["Kişi", "Kurum", "Sonuç", "Tarih"]}>
            {resolved.map((application) => {
              const status = STATUS[application.status as keyof typeof STATUS];
              return (
                <tr key={application.id}>
                  <td>{name(application)}</td>
                  <td>{application.institution || "—"}</td>
                  <td>
                    <AdminBadge tone={status?.tone ?? "mute"}>
                      {status?.label ?? application.status}
                    </AdminBadge>
                  </td>
                  <td className="adm-num text-xs text-[var(--adm-muted)]">
                    {formatDate(application.created_at)}
                  </td>
                </tr>
              );
            })}
          </AdminTableFrame>
        </AdminCard>
      ) : null}
    </AdminShell>
  );
}
