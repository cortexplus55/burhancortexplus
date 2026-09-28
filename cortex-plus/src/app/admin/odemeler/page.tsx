import { AdminShell } from "@/components/admin/admin-shell";
import { AdminBadge, AdminCard, AdminEmpty, AdminNote, AdminTableFrame } from "@/components/admin/admin-ui";
import { RefundButton } from "@/components/admin/refund-button";
import { requireAdmin } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { countPendingApplications } from "@/lib/admin/pending";
import { formatDate, formatTry } from "@/lib/format";
import { parseRefundReason } from "@/lib/payments/refund";

export const metadata = { title: "Yönetim · Ödemeler" };

const STATUS = {
  paid: { label: "Ödendi", tone: "ok" },
  pending: { label: "Bekliyor", tone: "warn" },
  failed: { label: "Başarısız", tone: "bad" },
  refunded: { label: "İade edildi", tone: "mute" },
} as const;

type SearchParams = Promise<{ filtre?: string }>;

export default async function AdminOdemelerPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  await requireAdmin();
  const service = createServiceClient();
  const params = searchParams ? await searchParams : {};
  const onlyRefunds = params.filtre === "iadeler";

  const [{ data: payments }, { data: events }, { data: refundRows }, pending] =
    await Promise.all([
      service
        .from("payments")
        .select(
          "id, merchant_oid, amount_try, status, created_at, profiles!payments_user_id_fkey(full_name)",
        )
        .order("created_at", { ascending: false })
        .limit(50),
      service
        .from("payment_webhook_events")
        .select("merchant_oid, status, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
      service
        .from("refunds")
        .select("id, payment_id, amount_try, reason, created_at")
        .order("created_at", { ascending: false })
        .limit(200),
      countPendingApplications(service),
    ]);

  const refundsByPayment = new Map<
    string,
    {
      totalKurus: number;
      rows: {
        id: string;
        amount_try: number;
        created_at: string;
        reason: ReturnType<typeof parseRefundReason>;
      }[];
    }
  >();

  for (const row of refundRows ?? []) {
    const reason = parseRefundReason(row.reason as string | null);
    if (reason?.state === "failed" || reason?.state === "pending") continue;
    const paymentId = row.payment_id as string;
    const bucket = refundsByPayment.get(paymentId) ?? {
      totalKurus: 0,
      rows: [],
    };
    bucket.totalKurus += row.amount_try ?? 0;
    bucket.rows.push({
      id: row.id as string,
      amount_try: row.amount_try as number,
      created_at: row.created_at as string,
      reason,
    });
    refundsByPayment.set(paymentId, bucket);
  }

  let rows = payments ?? [];
  if (onlyRefunds) {
    rows = rows.filter(
      (p) =>
        p.status === "refunded" || (refundsByPayment.get(p.id)?.totalKurus ?? 0) > 0,
    );
  }

  const totals = rows.reduce(
    (acc, row) => {
      if (row.status === "paid") acc.paid += row.amount_try ?? 0;
      if (row.status === "refunded") acc.refunded += row.amount_try ?? 0;
      else acc.refunded += refundsByPayment.get(row.id)?.totalKurus ?? 0;
      return acc;
    },
    { paid: 0, refunded: 0 },
  );

  return (
    <AdminShell href="/admin/odemeler" pendingApplications={pending}>
      <AdminNote tone="warn">
        <strong>İade hem PayTR&apos;ye para gönderir hem hesabı düzeltir.</strong>{" "}
        Kredi paketinde kalan kredi bakiyeden düşülür; harcanmış kısım
        &quot;geri alınamayan&quot; olarak görünür (bakiye eksiye inmez). Plus /
        Sigma tam iadesinde aktif abonelik plan_id eşleşmese de geri alınır.
        Kısmi iade planı kapatmaz. Anında teslim edilen dijital hizmette cayma
        hakkı yoktur (Mesafeli Sözleşmeler m.15/1-ğ); admin iadesi hatalı
        tahsilat içindir.
      </AdminNote>

      <div className="mb-4 flex flex-wrap gap-2">
        <a
          href="/admin/odemeler"
          className={`adm-btn${!onlyRefunds ? " adm-btn--primary" : ""}`}
        >
          Tümü
        </a>
        <a
          href="/admin/odemeler?filtre=iadeler"
          className={`adm-btn${onlyRefunds ? " adm-btn--primary" : ""}`}
        >
          İadeler
        </a>
      </div>

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
            columns={["Kişi", "Sipariş no", "Tutar", "Durum", "İadeler", "Tarih", "İşlem"]}
          >
            {rows.map((payment) => {
              const refundInfo = refundsByPayment.get(payment.id);
              const refundedTotal = refundInfo?.totalKurus ?? 0;
              const baseStatus = STATUS[payment.status as keyof typeof STATUS];
              let statusLabel: string =
                baseStatus?.label ?? payment.status;
              let statusTone: "ok" | "warn" | "bad" | "mute" =
                baseStatus?.tone ?? "mute";
              if (payment.status === "paid" && refundedTotal > 0) {
                statusLabel = `Kısmi iade: ${formatTry(refundedTotal)}`;
                statusTone = "warn";
              }
              const person = payment.profiles as { full_name?: string } | null;
              return (
                <tr key={payment.id}>
                  <td className="font-medium">
                    {person?.full_name || "İsimsiz kullanıcı"}
                  </td>
                  <td className="text-xs text-[var(--adm-muted)]">
                    {payment.merchant_oid}
                  </td>
                  <td className="adm-num">
                    {formatTry(payment.amount_try ?? 0)}
                  </td>
                  <td>
                    <AdminBadge tone={statusTone}>
                      {statusLabel}
                    </AdminBadge>
                  </td>
                  <td className="text-xs text-[var(--adm-muted)]">
                    {refundInfo?.rows.length ? (
                      <ul className="space-y-1">
                        {refundInfo.rows.map((r) => (
                          <li key={r.id}>
                            {formatDate(r.created_at)} · {formatTry(r.amount_try)}
                            {r.reason?.reversed != null
                              ? ` · −${r.reason.reversed} kr`
                              : ""}
                            {r.reason?.unrecovered
                              ? ` · alınamayan ${r.reason.unrecovered}`
                              : ""}
                            {r.reason?.source
                              ? ` · ${r.reason.source === "reconcile" ? "mutabakat" : "admin"}`
                              : ""}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="adm-num text-xs text-[var(--adm-muted)]">
                    {formatDate(payment.created_at)}
                  </td>
                  <td>
                    <RefundButton
                      paymentId={payment.id}
                      paidKurus={payment.amount_try ?? 0}
                      alreadyRefundedKurus={refundedTotal}
                      status={payment.status}
                    />
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
