import Link from "next/link";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminBadge, AdminCard, AdminEmpty, AdminNote, AdminTableFrame } from "@/components/admin/admin-ui";
import { SupportAnsweredButton } from "@/components/admin/support-answered-button";
import { requireAdmin } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { countPendingApplications } from "@/lib/admin/pending";
import { formatDate } from "@/lib/format";
import { SUPPORT_SLA, supportSlaLine } from "@/lib/support/sla";

export const metadata = { title: "Yönetim · Destek talepleri" };
export const dynamic = "force-dynamic";

type Row = {
  id: string;
  user_id: string | null;
  subject: string;
  message: string;
  status: string | null;
  created_at: string;
  answered_at: string | null;
  profiles: { full_name: string | null } | null;
};

const hoursBetween = (from: string, to: number) => Math.round(((to - new Date(from).getTime()) / 3_600_000) * 10) / 10;

/**
 * Destek talepleri (19 Ekim 2026). `/destek` formundan gelenler; cevap e-postayla gider, burada
 * "Cevaplandı" ile an yazılır. Önceden talepleri görecek ya da kapatacak bir ekran yoktu: günlük
 * özetin "24 saati geçti" sayısı yalnız büyüyebiliyordu. Süre sözü `SUPPORT_SLA`ten.
 */
export default async function AdminDestekPage() {
  await requireAdmin();
  const service = createServiceClient();
  const now = Date.now();

  const [{ data, error }, pending] = await Promise.all([
    service
      .from("support_requests")
      .select("id, user_id, subject, message, status, created_at, answered_at, profiles(full_name)")
      .order("created_at", { ascending: false })
      .limit(100),
    countPendingApplications(service),
  ]);

  const rows = (data ?? []) as unknown as Row[];
  const open = rows.filter((row) => !row.answered_at && row.status === "open");
  const overdue = open.filter((row) => hoursBetween(row.created_at, now) > SUPPORT_SLA.hours);

  return (
    <AdminShell href="/admin/destek" pendingApplications={pending}>
      {error ? <AdminNote tone="warn">Talepler okunamadı ({error.code ?? "hata"}). Göç uygulanmış mı?</AdminNote> : null}
      <AdminNote tone={overdue.length ? "warn" : "info"}>
        Söz: {supportSlaLine()} Açık talep: {open.length}
        {overdue.length ? ` · ${overdue.length} tanesi ${SUPPORT_SLA.hours} saati geçti` : ""}. Cevabı e-postayla
        gönderdikten sonra &quot;Cevaplandı&quot;ya bas; süre buradan ölçülür.
      </AdminNote>

      <AdminCard title="Talepler" desc="En yeni üstte. Kişi adı öğrencinin destek görünümünü açar (e-posta orada)." bodyless>
        {rows.length ? (
          <AdminTableFrame columns={["Zaman", "Kimden", "Konu", "Mesaj", "Durum", "İşlem"]}>
            {rows.map((row) => {
              const late = !row.answered_at && hoursBetween(row.created_at, now) > SUPPORT_SLA.hours;
              return (
                <tr key={row.id}>
                  <td className="adm-num text-xs">{formatDate(row.created_at)}</td>
                  <td className="text-xs">
                    {row.user_id ? (
                      <Link href={`/admin/kullanicilar/${row.user_id}`} className="underline">
                        {row.profiles?.full_name || "Öğrenci"}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="text-xs">{row.subject}</td>
                  <td className="text-xs">{row.message.slice(0, 300)}</td>
                  <td>
                    {row.answered_at ? (
                      <AdminBadge tone={hoursBetween(row.created_at, new Date(row.answered_at).getTime()) > SUPPORT_SLA.hours ? "warn" : "ok"}>
                        Cevaplandı · {hoursBetween(row.created_at, new Date(row.answered_at).getTime())} sa
                      </AdminBadge>
                    ) : (
                      <AdminBadge tone={late ? "bad" : "gold"}>Açık · {hoursBetween(row.created_at, now)} sa</AdminBadge>
                    )}
                  </td>
                  <td>{row.answered_at ? null : <SupportAnsweredButton requestId={row.id} />}</td>
                </tr>
              );
            })}
          </AdminTableFrame>
        ) : (
          <AdminEmpty title="Talep yok">Öğrenciler /destek sayfasından yazınca burada görünür.</AdminEmpty>
        )}
      </AdminCard>
    </AdminShell>
  );
}
