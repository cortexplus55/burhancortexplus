import Link from "next/link";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminCard, AdminEmpty, AdminNote, AdminTableFrame } from "@/components/admin/admin-ui";
import { requireAdmin } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { countPendingApplications } from "@/lib/admin/pending";
import { listLessonGenerationFailures } from "@/lib/learning/lesson-generation-failures";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Yönetim · Ders hataları" };

const REASON_LABEL: Record<string, string> = {
  source_unavailable: "Kaynak yok",
  content_verification_failed: "Kalite kapısı",
  generation_failed: "Üretim hatası",
  no_prep_documents: "Belge yok",
  documents_processing: "Belge işleniyor",
  no_topic_mapping: "Konu eşleşmedi",
  pages_unusable: "Sayfa okunamadı",
  search_no_match: "Arama eşleşmedi",
  search_error: "Arama hatası",
};

export default async function AdminDersHatalariPage({
  searchParams,
}: {
  searchParams?: Promise<{ kind?: string; reason?: string; gun?: string }>;
}) {
  await requireAdmin();
  const service = createServiceClient();
  const params = (await searchParams) ?? {};
  const kind = params.kind?.trim() || null;
  const reason = params.reason?.trim() || null;
  const days = Math.min(30, Math.max(1, Number(params.gun) || 7));
  const since = new Date(Date.now() - days * 86_400_000).toISOString();

  const [rows, pending] = await Promise.all([
    listLessonGenerationFailures(service, {
      limit: 200,
      kind,
      reason,
      since,
    }),
    countPendingApplications(service),
  ]);

  return (
    <AdminShell href="/admin/ders-hatalari" pendingApplications={pending}>
      <AdminNote tone="info">
        Son 200 kayıt. Taslak metni saklanmaz — sebep kodu, kısa cümleler ve
        kaynak çözücü izi yeter. Zamanlar Europe/Istanbul (TRT).
      </AdminNote>

      <form className="adm-filters" method="get">
        <label>
          Tür
          <select name="kind" defaultValue={kind ?? ""}>
            <option value="">Hepsi</option>
            <option value="lesson">Ders</option>
            <option value="podcast">Podcast</option>
            <option value="qa">Alıştırma</option>
            <option value="oral">Sözlü</option>
          </select>
        </label>
        <label>
          Sebep
          <select name="reason" defaultValue={reason ?? ""}>
            <option value="">Hepsi</option>
            {Object.entries(REASON_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Gün
          <select name="gun" defaultValue={String(days)}>
            <option value="1">1</option>
            <option value="7">7</option>
            <option value="14">14</option>
            <option value="30">30</option>
          </select>
        </label>
        <button type="submit" className="adm-btn">
          Filtrele
        </button>
      </form>

      <AdminCard
        title="Ders üretim hataları"
        desc={`${rows.length} kayıt · son ${days} gün`}
        bodyless
      >
        {rows.length ? (
          <AdminTableFrame
            columns={[
              "Zaman (TRT)",
              "Tür",
              "Sebep",
              "Hazırlık / konu",
              "Aşama",
              "Çözücü",
              "Ret cümleleri",
            ]}
          >
            {rows.map((row) => {
              const trace = row.source_trace as {
                steps?: { step: string; ok: boolean; detail?: string }[];
                reason?: string;
              } | null;
              const stopped =
                trace?.steps
                  ?.filter((step) => !step.ok)
                  .map((step) => step.step)
                  .slice(0, 3)
                  .join(" → ") ||
                trace?.reason ||
                "—";
              return (
                <tr key={row.id}>
                  <td>{formatDate(row.created_at)}</td>
                  <td>{row.kind ?? "—"}</td>
                  <td>{REASON_LABEL[row.reason] ?? row.reason}</td>
                  <td>
                    {row.prep_id ? (
                      <Link href={`/deneme-sinavlari/${row.prep_id}`}>
                        {(row.topic_label || "konu").slice(0, 48)}
                      </Link>
                    ) : (
                      (row.topic_label || "—").slice(0, 48)
                    )}
                  </td>
                  <td>{row.stage ?? "—"}</td>
                  <td>{stopped}</td>
                  <td>
                    {(row.reasons ?? []).slice(0, 3).join(" · ") || "—"}
                  </td>
                </tr>
              );
            })}
          </AdminTableFrame>
        ) : (
          <AdminEmpty title="Kayıt yok">Bu filtrede ders üretim hatası görünmüyor.</AdminEmpty>
        )}
      </AdminCard>
    </AdminShell>
  );
}
