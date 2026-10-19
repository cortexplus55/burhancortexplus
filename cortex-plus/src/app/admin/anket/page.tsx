import Link from "next/link";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminBadge, AdminCard, AdminEmpty, AdminNote, AdminTableFrame } from "@/components/admin/admin-ui";
import { requireAdmin } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { countPendingApplications } from "@/lib/admin/pending";
import { isFeatureEnabled } from "@/lib/admin/feature-flags";
import { formatDate } from "@/lib/format";
import { SURVEY_FLAG, mostUsedLabel, summarizeWeeks, type SurveyRow } from "@/lib/feedback/weekly-survey";

export const metadata = { title: "Yönetim · Haftalık anket" };
export const dynamic = "force-dynamic";

const SEGMENT_LABEL: Record<string, string> = { free: "Ücretsiz", plus: "Plus", sigma: "Sigma", beta: "Beta" };

type Row = SurveyRow & {
  user_id: string;
  improve: string | null;
  segment: string | null;
  created_at: string;
};

/**
 * Haftalık kısa anket sonuçları (19 Ekim 2026, kapalı beta; plan Faz 5.2).
 *
 * Hafta hafta: cevap sayısı, "Şimdi değil" sayısı, yardım ortalaması (1-5), net tavsiye puanı
 * (9-10 verenler eksi 0-6 verenler, cevapların yüzdesi), en çok kullanılan. Altta son öneriler;
 * her satır öğrencinin destek görünümüne gider. Anket `/admin/feature-flags`te `weekly_survey`
 * anahtarıyla kapatılır.
 */
export default async function AdminAnketPage() {
  await requireAdmin();
  const service = createServiceClient();

  const [{ data, error }, enabled, pending] = await Promise.all([
    service
      .from("weekly_surveys")
      .select("user_id, week_key, dismissed, helpfulness, recommend, most_used, improve, segment, created_at")
      .order("created_at", { ascending: false })
      .limit(2000),
    isFeatureEnabled(service, SURVEY_FLAG),
    countPendingApplications(service),
  ]);

  const rows = (data ?? []) as Row[];
  const weeks = summarizeWeeks(rows).slice(0, 12);
  const comments = rows.filter((row) => !row.dismissed && row.improve).slice(0, 40);

  return (
    <AdminShell href="/admin/anket" pendingApplications={pending}>
      {error ? (
        <AdminNote tone="warn">Anket tablosu okunamadı ({error.code ?? "hata"}). Göç uygulanmış mı?</AdminNote>
      ) : null}
      <AdminNote tone="info">
        Anket {enabled ? <strong>açık</strong> : <strong>kapalı</strong>}: o hafta en az bir etkinlik açan, hesabı iki
        günden eski öğrenciye Sınavlar sayfasında haftada bir kez dört soru. Kapatmak için Özellik anahtarları →{" "}
        <code>weekly_survey</code>.
      </AdminNote>

      <AdminCard
        title="Hafta hafta"
        desc="Tavsiye puanı: 9-10 verenlerin yüzdesi eksi 0-6 verenlerin yüzdesi (-100 ile +100 arası)."
        bodyless
      >
        {weeks.length ? (
          <AdminTableFrame columns={["Hafta", "Cevap", "Şimdi değil", "Yardım (1-5)", "Tavsiye puanı", "En çok kullanılan"]}>
            {weeks.map((week) => (
              <tr key={week.week}>
                <td className="adm-num">{week.week}</td>
                <td className="adm-num">{week.answers}</td>
                <td className="adm-num">{week.dismissed}</td>
                <td className="adm-num">{week.helpfulness ?? "—"}</td>
                <td className="adm-num">
                  {week.nps === null ? (
                    "—"
                  ) : (
                    <AdminBadge tone={week.nps >= 30 ? "ok" : week.nps >= 0 ? "gold" : "warn"}>
                      {week.nps > 0 ? `+${week.nps}` : week.nps}
                    </AdminBadge>
                  )}
                </td>
                <td className="text-xs">
                  {week.mostUsed.length ? week.mostUsed.slice(0, 3).map((item) => `${item.label} ${item.count}`).join(" · ") : "—"}
                </td>
              </tr>
            ))}
          </AdminTableFrame>
        ) : (
          <AdminEmpty title="Henüz cevap yok">Öğrenciler o hafta çalıştıktan sonra Sınavlar sayfasında görecek.</AdminEmpty>
        )}
      </AdminCard>

      <AdminCard title="Son öneriler" desc="Öğrencinin kendi cümlesi; satır öğrencinin destek görünümünü açar." bodyless>
        {comments.length ? (
          <AdminTableFrame columns={["Zaman", "Plan", "Yardım", "Tavsiye", "En çok", "Öneri"]}>
            {comments.map((row, index) => (
              <tr key={`${row.user_id}-${row.week_key}-${index}`}>
                <td className="adm-num text-xs">
                  <Link href={`/admin/kullanicilar/${row.user_id}`} className="underline">
                    {formatDate(row.created_at)}
                  </Link>
                </td>
                <td>{row.segment ? (SEGMENT_LABEL[row.segment] ?? row.segment) : "—"}</td>
                <td className="adm-num">{row.helpfulness ?? "—"}</td>
                <td className="adm-num">{row.recommend ?? "—"}</td>
                <td className="text-xs">{mostUsedLabel(row.most_used)}</td>
                <td className="text-xs">{row.improve}</td>
              </tr>
            ))}
          </AdminTableFrame>
        ) : (
          <AdminEmpty title="Öneri yok">Yazılı öneri gelince burada görünür.</AdminEmpty>
        )}
      </AdminCard>
    </AdminShell>
  );
}
