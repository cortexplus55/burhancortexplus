import Link from "next/link";
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
import {
  ABUSE_EXPLANATIONS,
  abuseLabel,
  severityLabel,
  severityTone,
} from "@/lib/admin/abuse-labels";
import { formatDate, formatNumber } from "@/lib/format";

export const metadata = { title: "Yönetim · Kötüye kullanım" };

const WINDOW_DAYS = 7;

type EventRow = {
  id: string;
  user_id: string | null;
  signal: string;
  severity: string;
  scope: string | null;
  ip_hash: string | null;
  created_at: string;
  profiles: { full_name?: string | null } | null;
};

export default async function AdminKotuyeKullanimPage() {
  await requireAdmin();
  const service = createServiceClient();
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();

  const [{ data: events }, pending] = await Promise.all([
    service
      .from("abuse_events")
      .select(
        "id, user_id, signal, severity, scope, ip_hash, created_at, profiles!abuse_events_user_id_fkey(full_name)",
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(300),
    countPendingApplications(service),
  ]);

  const rows = (events ?? []) as unknown as EventRow[];

  // Sinyal türüne göre özet — "bu hafta en çok ne oldu".
  const bySignal = new Map<string, number>();
  // Kişiye göre özet — aynı hesap kaç kez düştü. Asıl bakılacak yer burası:
  // tek bir olay gürültü, aynı hesabın yirmi olayı bir desendir.
  const byUser = new Map<string, { name: string; count: number; worst: string }>();

  for (const row of rows) {
    bySignal.set(row.signal, (bySignal.get(row.signal) ?? 0) + 1);
    if (!row.user_id) continue;
    const existing = byUser.get(row.user_id);
    const rank = { low: 0, medium: 1, high: 2 } as Record<string, number>;
    byUser.set(row.user_id, {
      name: row.profiles?.full_name || "Adı yok",
      count: (existing?.count ?? 0) + 1,
      worst:
        (rank[row.severity] ?? 0) > (rank[existing?.worst ?? "low"] ?? 0)
          ? row.severity
          : (existing?.worst ?? "low"),
    });
  }

  const signalSummary = [...bySignal.entries()].sort((a, b) => b[1] - a[1]);
  const repeatOffenders = [...byUser.entries()]
    .filter(([, v]) => v.count >= 3)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 20);

  return (
    <AdminShell href="/admin/kotuye-kullanim" pendingApplications={pending}>
      <AdminNote tone="info">
        Bu sayfa <strong>yalnızca gözlemliyor</strong>. Buraya düşen hiçbir
        hesap otomatik olarak kapatılmıyor, kısıtlanmıyor. Amaç, gerçek
        kullanımı görüp sınırların doğru yerde olup olmadığını anlamak. Sayılar
        son {WINDOW_DAYS} günü kapsıyor.
      </AdminNote>

      <AdminCard
        title="Bu hafta ne oldu"
        desc="Türüne göre kaç olay kaydedildi."
      >
        {signalSummary.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {signalSummary.map(([signal, count]) => (
              <div
                key={signal}
                className="rounded-lg border border-[var(--adm-line)] p-3"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">{abuseLabel(signal)}</span>
                  <span className="adm-num text-lg font-semibold">
                    {formatNumber(count)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-[var(--adm-muted)]">
                  {ABUSE_EXPLANATIONS[signal] ?? ""}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <AdminEmpty title="Bu hafta hiç olay yok">
            Sınırlara takılan olmamış. Yayın yeniyse bu beklenen bir sonuç.
          </AdminEmpty>
        )}
      </AdminCard>

      <AdminCard
        title="Tekrar eden hesaplar"
        desc="Bu hafta üç ve üzeri olayı olanlar. Bir kez takılmak gürültü, tekrarlamak desendir."
        bodyless
      >
        {repeatOffenders.length ? (
          <AdminTableFrame columns={["Kim", "Kaç olay", "En ağırı", "Hesap"]}>
            {repeatOffenders.map(([userId, info]) => (
              <tr key={userId}>
                <td className="font-medium">{info.name}</td>
                <td className="adm-num">{formatNumber(info.count)}</td>
                <td>
                  <AdminBadge tone={severityTone(info.worst)}>
                    {severityLabel(info.worst)}
                  </AdminBadge>
                </td>
                <td>
                  <Link
                    href={`/admin/kullanicilar?q=${userId}`}
                    className="text-xs underline"
                  >
                    Hesabı aç
                  </Link>
                </td>
              </tr>
            ))}
          </AdminTableFrame>
        ) : (
          <AdminEmpty title="Tekrar eden yok">
            Kimse bu hafta üç kereden fazla sınıra takılmamış.
          </AdminEmpty>
        )}
      </AdminCard>

      <AdminCard
        title="Son olaylar"
        desc="En yeni üstte. Adres, geri çevrilemez bir özet olarak tutuluyor — ham IP saklanmıyor."
        bodyless
      >
        {rows.length ? (
          <AdminTableFrame
            columns={["Ne oldu", "Kim", "Nerede", "Ağırlık", "Ne zaman"]}
          >
            {rows.slice(0, 100).map((row) => (
              <tr key={row.id}>
                <td className="font-medium">{abuseLabel(row.signal)}</td>
                <td>
                  {row.profiles?.full_name || (
                    <span className="text-[var(--adm-muted)]">
                      Giriş yapmamış
                    </span>
                  )}
                </td>
                <td className="text-xs text-[var(--adm-muted)]">
                  {row.scope ?? "—"}
                </td>
                <td>
                  <AdminBadge tone={severityTone(row.severity)}>
                    {severityLabel(row.severity)}
                  </AdminBadge>
                </td>
                <td className="adm-num text-xs text-[var(--adm-muted)]">
                  {formatDate(row.created_at)}
                </td>
              </tr>
            ))}
          </AdminTableFrame>
        ) : (
          <AdminEmpty title="Kayıt yok">
            Koruma çalışıyor ama henüz kimse sınıra takılmadı.
          </AdminEmpty>
        )}
      </AdminCard>
    </AdminShell>
  );
}
