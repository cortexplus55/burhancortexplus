import Link from "next/link";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminBadge, AdminCard, AdminEmpty, AdminNote, AdminTableFrame } from "@/components/admin/admin-ui";
import { DuelReportDecision } from "@/components/admin/duel-report-decision";
import { requireAdminPage } from "@/lib/auth/admin-guard";
import { createServiceClient } from "@/lib/supabase/server";
import { countPendingApplications } from "@/lib/admin/pending";
import { formatDate } from "@/lib/format";
import { DUEL_REPORT_REASON_LABELS, isDuelReportReason } from "@/lib/learning/duel-moderation";
import { missingRelation } from "@/lib/learning/missing-column";

export const metadata = { title: "Yönetim · Düello Bildirimleri" };
export const dynamic = "force-dynamic";

type Row = {
  id: string;
  run_id: string;
  reporter_id: string | null;
  reported_user_id: string | null;
  reported_name: string;
  reason: string;
  note: string | null;
  status: string;
  created_at: string;
  prep_duels: { title: string | null; share_code: string | null } | null;
};

const STATUS: Record<string, { label: string; tone: "gold" | "bad" | "ok" }> = {
  open: { label: "Açık", tone: "gold" },
  hidden: { label: "Ad gizlendi", tone: "bad" },
  dismissed: { label: "Kapatıldı", tone: "ok" },
};

/**
 * Düello bildirimleri (26 Kasım 2026, mobil 1. adım; App Store 1.2 ve Google Play kullanıcı içeriği politikası).
 * Oyuncuların sıralamada bildirdiği adlar ve davranışlar. Mağazalar bildirimin makul sürede ele alınmasını ister:
 * açık bildirimler üstte. İki ayrı kişiden "uygunsuz ad" gelen tur karar beklemeden sıralamada "Oyuncu" görünür.
 */
export default async function AdminDuelReportsPage() {
  await requireAdminPage();
  const service = createServiceClient();
  const [{ data, error }, pending] = await Promise.all([
    service
      .from("duel_reports")
      .select("id, run_id, reporter_id, reported_user_id, reported_name, reason, note, status, created_at, prep_duels(title, share_code)")
      .order("status", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(150),
    countPendingApplications(service),
  ]);
  const rows = ((data ?? []) as unknown as Row[]).sort((a, b) => Number(a.status !== "open") - Number(b.status !== "open"));
  const open = rows.filter((row) => row.status === "open").length;

  return (
    <AdminShell href="/admin/duello-bildirimleri" pendingApplications={pending}>
      {error ? (
        <AdminNote tone="warn">
          {missingRelation(error)
            ? "Bildirim tablosu henüz yok: 20261126180000_duel_reports_blocks göçü uygulanınca bildirimler burada görünür."
            : `Bildirimler okunamadı (hata kodu: ${error.code ?? "yok"}).`}
        </AdminNote>
      ) : (
        <AdminNote tone={open ? "warn" : "info"}>
          Açık bildirim: {open}. Mağazalar bildirimin 24 saat içinde ele alınmasını bekler. &quot;Adı gizle&quot; turun adını
          sıralamada &quot;Oyuncu&quot; yapar; &quot;Bildirimi kapat&quot; kendiliğinden gizlemeyi de kaldırır.
        </AdminNote>
      )}

      <AdminCard title="Bildirimler" desc="Açık olanlar üstte. Bildirilen hesaplı oyuncunun adı kullanıcı sayfasını açar." bodyless>
        {rows.length ? (
          <AdminTableFrame columns={["Zaman", "Düello", "Bildirilen", "Neden", "Not", "Durum", "İşlem"]}>
            {rows.map((row) => {
              const status = STATUS[row.status] ?? STATUS.open;
              return (
                <tr key={row.id}>
                  <td className="adm-num text-xs">{formatDate(row.created_at)}</td>
                  <td className="text-xs">
                    {row.prep_duels?.share_code ? (
                      <Link href={`/duello/${row.prep_duels.share_code}`} className="underline">
                        {row.prep_duels.title || "Düello"}
                      </Link>
                    ) : (
                      row.prep_duels?.title || "Düello"
                    )}
                  </td>
                  <td className="text-xs">
                    {row.reported_user_id ? (
                      <Link href={`/admin/kullanicilar/${row.reported_user_id}`} className="underline">
                        {row.reported_name}
                      </Link>
                    ) : (
                      <>
                        {row.reported_name} <span className="text-[11px] opacity-70">(misafir)</span>
                      </>
                    )}
                  </td>
                  <td className="text-xs">{isDuelReportReason(row.reason) ? DUEL_REPORT_REASON_LABELS[row.reason] : "Başka bir sorun"}</td>
                  <td className="text-xs">{row.note ? row.note.slice(0, 300) : "—"}</td>
                  <td>
                    <AdminBadge tone={status.tone}>{status.label}</AdminBadge>
                  </td>
                  <td>
                    <DuelReportDecision reportId={row.id} status={row.status} />
                  </td>
                </tr>
              );
            })}
          </AdminTableFrame>
        ) : error ? null : (
          <AdminEmpty title="Bildirim yok">Oyuncular düello sıralamasında &quot;Bildir&quot;e basınca burada görünür.</AdminEmpty>
        )}
      </AdminCard>
    </AdminShell>
  );
}
