import { AdminShell } from "@/components/admin/admin-shell";
import {
  AdminBadge,
  AdminCard,
  AdminEmpty,
  AdminNote,
  AdminTableFrame,
} from "@/components/admin/admin-ui";
import { requireAdmin } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { countPendingApplications } from "@/lib/admin/pending";
import { formatDate, formatNumber } from "@/lib/format";

export const metadata = { title: "Yönetim · Yanıt oyları" };

/** Öğrencinin seçtiği sebebin gündelik karşılığı. */
const REASON_LABEL: Record<string, string> = {
  yanlis: "Yanlış",
  anlasilmadi: "Anlamadım",
  eksik: "Eksik kaldı",
};

export default async function AdminYanitOylariPage() {
  await requireAdmin();
  const service = createServiceClient();

  const [{ data: rows, error }, pending] = await Promise.all([
    service
      .from("messages")
      .select("id, content, model, rating, rating_reason, rated_at")
      .not("rating", "is", null)
      .order("rated_at", { ascending: false })
      .limit(200),
    countPendingApplications(service),
  ]);

  // Göç henüz uygulanmadıysa sütunlar yok; sayfa çökmek yerine bunu söylüyor.
  if (error) {
    return (
      <AdminShell href="/admin/yanit-oylari" pendingApplications={pending}>
        <AdminNote tone="warn">
          Oylama sütunları veritabanında henüz yok. Bu sayfanın çalışması için{" "}
          <code>20260904140000_message_feedback.sql</code> göçünün uygulanması
          gerekiyor; adımlar <code>docs/delivery/SENIN-YAPACAKLARIN.md</code>{" "}
          dosyasında.
        </AdminNote>
      </AdminShell>
    );
  }

  const all = rows ?? [];
  const bad = all.filter((row) => row.rating === -1);
  const good = all.length - bad.length;
  const ratio = all.length ? Math.round((good / all.length) * 100) : 0;

  // Hangi sebep kaç kez seçilmiş — talimatı nereden düzelteceğini bu söylüyor.
  const reasonCounts = new Map<string, number>();
  for (const row of bad) {
    const key = row.rating_reason ?? "belirtilmedi";
    reasonCounts.set(key, (reasonCounts.get(key) ?? 0) + 1);
  }

  return (
    <AdminShell href="/admin/yanit-oylari" pendingApplications={pending}>
      <AdminNote tone="info">
        Öğrenciler yanıtların altındaki başparmağa bastığında buraya düşüyor.
        Amaç puan toplamak değil: <strong>kötü bulunan yanıtları okuyup</strong>{" "}
        <a href="/admin/promptlar">AI talimatlarını</a> ona göre düzeltmek.
        Son 200 oy gösteriliyor.
      </AdminNote>

      <AdminCard
        title="Özet"
        desc="Oy veren öğrenci azınlıkta kalır; buradaki oran tüm kullanıcıların memnuniyeti değil, yalnızca oy verenlerin."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <div className="text-2xl font-semibold">{formatNumber(all.length)}</div>
            <div className="text-xs text-[var(--adm-muted)]">toplam oy</div>
          </div>
          <div>
            <div className="text-2xl font-semibold">{formatNumber(bad.length)}</div>
            <div className="text-xs text-[var(--adm-muted)]">işine yaramamış</div>
          </div>
          <div>
            <div className="text-2xl font-semibold">%{ratio}</div>
            <div className="text-xs text-[var(--adm-muted)]">olumlu oran</div>
          </div>
        </div>

        {reasonCounts.size ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {[...reasonCounts.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([key, count]) => (
                <AdminBadge key={key} tone="warn">
                  {REASON_LABEL[key] ?? "Sebep seçilmemiş"}: {formatNumber(count)}
                </AdminBadge>
              ))}
          </div>
        ) : null}
      </AdminCard>

      <AdminCard
        title="İşine yaramayan yanıtlar"
        desc="En yeni üstte. Metnin tamamını görmek için satırın üstüne gelebilirsin."
        bodyless
      >
        {bad.length ? (
          <AdminTableFrame columns={["Yanıt (başlangıcı)", "Sebep", "Model", "Ne zaman"]}>
            {bad.map((row) => (
              <tr key={row.id}>
                <td className="max-w-lg truncate text-xs" title={row.content}>
                  {row.content.slice(0, 160)}
                  {row.content.length > 160 ? "…" : ""}
                </td>
                <td>
                  <AdminBadge tone={row.rating_reason ? "warn" : "mute"}>
                    {row.rating_reason
                      ? (REASON_LABEL[row.rating_reason] ?? row.rating_reason)
                      : "Seçilmemiş"}
                  </AdminBadge>
                </td>
                <td className="text-xs text-[var(--adm-muted)]">{row.model ?? "—"}</td>
                <td className="adm-num text-xs text-[var(--adm-muted)]">
                  {row.rated_at ? formatDate(row.rated_at) : "—"}
                </td>
              </tr>
            ))}
          </AdminTableFrame>
        ) : (
          <AdminEmpty title="Olumsuz oy yok">
            Ya henüz kimse oy vermedi ya da verilen oyların hepsi olumlu.
          </AdminEmpty>
        )}
      </AdminCard>
    </AdminShell>
  );
}
