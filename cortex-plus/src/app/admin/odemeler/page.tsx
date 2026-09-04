import { AdminShell } from "@/components/admin/admin-shell";
import { AdminBadge, AdminCard, AdminEmpty, AdminNote, AdminTableFrame } from "@/components/admin/admin-ui";
import { RefundButton } from "@/components/admin/refund-button";
import { requireAdmin } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { countPendingApplications } from "@/lib/admin/pending";
import { formatDate, formatTry } from "@/lib/format";

export const metadata = { title: "Yönetim · Ödemeler" };

const STATUS = {
  paid: { label: "Ödendi", tone: "ok" },
  pending: { label: "Bekliyor", tone: "warn" },
  failed: { label: "Başarısız", tone: "bad" },
  refunded: { label: "İade edildi", tone: "mute" },
} as const;

export default async function AdminOdemelerPage() {
  await requireAdmin();
  const service = createServiceClient();

  const [{ data: payments }, { data: events }, pending] = await Promise.all([
    service
      .from("payments")
      .select("id, merchant_oid, amount_try, status, created_at, profiles(full_name)")
      .order("created_at", { ascending: false })
      .limit(50),
    service
      .from("payment_webhook_events")
      .select("merchant_oid, status, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    countPendingApplications(service),
  ]);

  const rows = payments ?? [];
  const totals = rows.reduce(
    (acc, row) => {
      if (row.status === "paid") acc.paid += row.amount_try ?? 0;
      if (row.status === "refunded") acc.refunded += row.amount_try ?? 0;
      return acc;
    },
    { paid: 0, refunded: 0 },
  );

  return (
    <AdminShell href="/admin/odemeler" pendingApplications={pending}>
      <AdminNote tone="warn">
        <strong>İade işareti parayı geri göndermez.</strong> Parayı iade etmek
        ödeme sağlayıcısının kendi panelinden yapılır; buradaki işaret yalnızca
        bizim kayıtlarımızı düzeltir, böylece gelir toplamı şişik kalmaz.
      </AdminNote>

      <div className="adm-stats">
        <div className="adm-stat">
          <span className="adm-stat-label">Son 50 işlemde tahsilat</span>
          <span className="adm-stat-value">{formatTry(totals.paid)}</span>
          <span className="adm-stat-hint">Yalnızca ödenmiş kayıtlar</span>
        </div>
        <div className="adm-stat">
          <span className="adm-stat-label">İade edilen</span>
          <span className="adm-stat-value">{formatTry(totals.refunded)}</span>
          <span className="adm-stat-hint">Gelirden düşülmüş tutar</span>
        </div>
      </div>

      <AdminCard title="İşlemler" desc="En yeni 50 kayıt." bodyless>
        {rows.length ? (
          <AdminTableFrame
            columns={["Kişi", "Sipariş no", "Tutar", "Durum", "Tarih", "İşlem"]}
          >
            {rows.map((payment) => {
              const status = STATUS[payment.status as keyof typeof STATUS];
              const person = payment.profiles as { full_name?: string } | null;
              return (
                <tr key={payment.id}>
                  <td className="font-medium">{person?.full_name || "İsimsiz kullanıcı"}</td>
                  <td className="text-xs text-[var(--adm-muted)]">{payment.merchant_oid}</td>
                  <td className="adm-num">{formatTry(payment.amount_try ?? 0)}</td>
                  <td>
                    <AdminBadge tone={status?.tone ?? "mute"}>
                      {status?.label ?? payment.status}
                    </AdminBadge>
                  </td>
                  <td className="adm-num text-xs text-[var(--adm-muted)]">
                    {formatDate(payment.created_at)}
                  </td>
                  <td>
                    {payment.status === "paid" ? (
                      <RefundButton paymentId={payment.id} />
                    ) : (
                      <span className="text-xs text-[var(--adm-muted)]">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </AdminTableFrame>
        ) : (
          <AdminEmpty title="Henüz ödeme yok">
            Ödeme altyapısı devreye girip ilk satış gerçekleştiğinde işlemler
            burada listelenir.
          </AdminEmpty>
        )}
      </AdminCard>

      <AdminCard
        title="Ödeme sağlayıcısından gelen bildirimler"
        desc="Banka tarafı bir işlemin sonucunu bize bu kayıtlarla bildiriyor. Bir ödeme takıldıysa önce buraya bakılır."
        bodyless
      >
        {events?.length ? (
          <AdminTableFrame columns={["Sipariş no", "Bildirilen durum", "Tarih"]}>
            {events.map((event, index) => (
              <tr key={`${event.merchant_oid}-${index}`}>
                <td className="text-xs">{event.merchant_oid}</td>
                <td>{event.status}</td>
                <td className="adm-num text-xs text-[var(--adm-muted)]">
                  {formatDate(event.created_at)}
                </td>
              </tr>
            ))}
          </AdminTableFrame>
        ) : (
          <AdminEmpty title="Henüz bildirim yok">
            İlk ödeme denemesinden sonra burada kayıt oluşur.
          </AdminEmpty>
        )}
      </AdminCard>
    </AdminShell>
  );
}
