import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminBadge, AdminCard, AdminEmpty, AdminTableFrame } from "@/components/admin/admin-ui";
import { requireAdmin } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { countPendingApplications } from "@/lib/admin/pending";
import { formatDate, formatNumber, formatTry } from "@/lib/format";

export const metadata = { title: "Yönetim · Özet" };

/** Son 30 gün — "bu ay ne oldu" sorusunun cevabı. */
const WINDOW_DAYS = 30;

export default async function AdminPage() {
  await requireAdmin();
  const service = createServiceClient();
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString();

  const [users, newUsers, pending, paidAll, paidWindow, usage, recentPayments] =
    await Promise.all([
      service.from("profiles").select("id", { count: "exact", head: true }),
      service
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since),
      countPendingApplications(service),
      service.from("payments").select("amount_try").eq("status", "paid"),
      service
        .from("payments")
        .select("amount_try")
        .eq("status", "paid")
        .gte("created_at", since),
      service
        .from("ai_usage_events")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since),
      service
        .from("payments")
        .select("id, amount_try, status, created_at, profiles(full_name)")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

  const sum = (rows: { amount_try: number | null }[] | null) =>
    (rows ?? []).reduce((total, row) => total + (row.amount_try ?? 0), 0);

  const revenueAll = sum(paidAll.data);
  const revenueWindow = sum(paidWindow.data);

  const stats = [
    {
      label: "Kayıtlı kullanıcı",
      value: formatNumber(users.count ?? 0),
      hint: `Son ${WINDOW_DAYS} günde ${formatNumber(newUsers.count ?? 0)} yeni kayıt`,
    },
    {
      label: "Toplam gelir",
      value: formatTry(revenueAll),
      hint: `Son ${WINDOW_DAYS} günde ${formatTry(revenueWindow)}`,
    },
    {
      label: "AI işlemi",
      value: formatNumber(usage.count ?? 0),
      hint: `Son ${WINDOW_DAYS} gün`,
    },
    {
      label: "Bekleyen başvuru",
      value: formatNumber(pending),
      hint: pending > 0 ? "Senden cevap bekliyor" : "Bekleyen iş yok",
    },
  ];

  const statusTone = { paid: "ok", pending: "warn", failed: "bad", refunded: "mute" } as const;
  const statusLabel = {
    paid: "Ödendi",
    pending: "Bekliyor",
    failed: "Başarısız",
    refunded: "İade edildi",
  } as const;

  return (
    <AdminShell href="/admin" pendingApplications={pending}>
      <div className="adm-stats">
        {stats.map((stat) => (
          <div key={stat.label} className="adm-stat">
            <span className="adm-stat-label">{stat.label}</span>
            <span className="adm-stat-value">{stat.value}</span>
            <span className="adm-stat-hint">{stat.hint}</span>
          </div>
        ))}
      </div>

      {/* Bekleyen iş varsa panele girer girmez görünmeli; menüdeki sayıyı
          görmek için menüye bakmak gerekiyor, bu kart göze çarpıyor. */}
      {pending > 0 ? (
        <AdminCard
          title="Seni bekleyen iş var"
          desc={`${pending} öğretmen başvurusu cevap bekliyor.`}
          actions={
            <Link href="/admin/ogretmen-basvurulari" className="adm-btn adm-btn--primary">
              Başvurulara git
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          }
        >
          <p className="text-sm text-[var(--adm-muted)]">
            Başvuran kişi onay gelene kadar öğretmen özelliklerini kullanamıyor.
          </p>
        </AdminCard>
      ) : (
        <div className="adm-note adm-note--info">
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          <div>Bekleyen bir iş yok. Başvuru geldiğinde burada ve soldaki menüde görünür.</div>
        </div>
      )}

      <AdminCard
        title="Son ödemeler"
        desc="En yeni beş işlem."
        bodyless
        actions={
          <Link href="/admin/odemeler" className="adm-btn">
            Hepsini gör
          </Link>
        }
      >
        {recentPayments.data?.length ? (
          <AdminTableFrame columns={["Kişi", "Tutar", "Durum", "Tarih"]}>
            {recentPayments.data.map((payment) => {
              const person = payment.profiles as { full_name?: string } | null;
              const status = payment.status as keyof typeof statusLabel;
              return (
                <tr key={payment.id}>
                  <td>{person?.full_name || "İsimsiz kullanıcı"}</td>
                  <td className="adm-num">{formatTry(payment.amount_try ?? 0)}</td>
                  <td>
                    <AdminBadge tone={statusTone[status] ?? "mute"}>
                      {statusLabel[status] ?? status}
                    </AdminBadge>
                  </td>
                  <td className="adm-num">{formatDate(payment.created_at)}</td>
                </tr>
              );
            })}
          </AdminTableFrame>
        ) : (
          <AdminEmpty title="Henüz ödeme yok">
            İlk satış gerçekleştiğinde işlemler burada listelenir.
          </AdminEmpty>
        )}
      </AdminCard>

      {revenueAll === 0 ? (
        <div className="adm-note adm-note--warn">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          <div>
            Henüz hiç ödeme alınmamış. Ödeme altyapısı (PayTR) devreye alınmadan
            paketler satın alınamaz — bu yüzden gelir sıfır görünüyor.
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}
