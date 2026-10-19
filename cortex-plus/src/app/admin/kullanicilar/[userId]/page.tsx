import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminBadge, AdminCard, AdminEmpty, AdminNote, AdminTableFrame } from "@/components/admin/admin-ui";
import { SubscriptionExtend } from "@/components/admin/subscription-extend";
import { UserActions } from "@/components/admin/user-actions";
import { requireAdmin } from "@/lib/auth/session";
import { createServiceClient } from "@/lib/supabase/server";
import { countPendingApplications } from "@/lib/admin/pending";
import { formatDate, formatNumber } from "@/lib/format";
import { isTrialPeriod } from "@/lib/payments/subscription";
import {
  failureReasonLabel,
  nodeKindLabel,
  paymentStatusLabel,
  subscriptionStatusLabel,
} from "@/lib/admin/support-labels";

export const metadata = { title: "Yönetim · Kullanıcı" };
export const dynamic = "force-dynamic";

/**
 * Bir kullanıcının destek görünümü (19 Ekim 2026, satışa hazırlık plan 4.2 ve 4.5).
 *
 * "Kullanıcı olarak gör" yerine salt okunur özet: hesap, abonelik (elle uzatma), hazırlıklar (her biri
 * salt okunur hazırlık görünümüne gider), son üretim hataları, son ödemeler. Öğrencinin içeriği (ders
 * metni, cevaplar) burada gösterilmez; hazırlık görünümü yalnız yapıyı ve durumu gösterir ve açılışı
 * denetim günlüğüne yazılır.
 */
export default async function AdminKullaniciPage({ params }: { params: Promise<{ userId: string }> }) {
  const { user: actor } = await requireAdmin();
  const { userId } = await params;
  const service = createServiceClient();

  const [{ data: profile }, authUser, pending] = await Promise.all([
    service
      .from("profiles")
      .select(
        "id, full_name, grade_level, created_at, suspended_at, credit_wallets(balance), user_roles!user_roles_user_id_fkey(role, revoked_at)",
      )
      .eq("id", userId)
      .maybeSingle(),
    service.auth.admin.getUserById(userId).catch(() => null),
    countPendingApplications(service),
  ]);
  if (!profile) notFound();

  const [{ data: subscription }, { data: preps }, { data: failures }, { data: payments }] = await Promise.all([
    service
      .from("subscriptions")
      .select("id, status, current_period_end, trial_until, plans(name, slug)")
      .eq("user_id", userId)
      .order("current_period_end", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    service
      .from("exam_preps")
      .select("id, title, exam_date, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30),
    service
      .from("lesson_generation_failures")
      .select("created_at, kind, reason, topic_label, prep_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10),
    service
      .from("payments")
      .select("id, amount_try, status, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const prepIds = (preps ?? []).map((prep) => prep.id as string);
  const { data: nodeRows } = prepIds.length
    ? await service.from("exam_prep_nodes").select("exam_prep_id, status").in("exam_prep_id", prepIds)
    : { data: [] as { exam_prep_id: string; status: string }[] };
  const progress = new Map<string, { done: number; total: number }>();
  for (const row of nodeRows ?? []) {
    const entry = progress.get(row.exam_prep_id as string) ?? { done: 0, total: 0 };
    entry.total += 1;
    if (row.status === "done") entry.done += 1;
    progress.set(row.exam_prep_id as string, entry);
  }

  const roles = (profile.user_roles ?? []).filter((role) => !role.revoked_at).map((role) => role.role as string);
  const wallet = profile.credit_wallets as { balance?: number } | null;
  const isSuspended = Boolean((profile as { suspended_at?: string | null }).suspended_at);
  const email = authUser?.data?.user?.email ?? "—";
  const plan = (subscription?.plans as { name?: string } | null)?.name ?? null;
  const subscriptionActive =
    subscription?.status === "active" &&
    (!subscription.current_period_end || new Date(subscription.current_period_end as string).getTime() > Date.now());

  return (
    <AdminShell href="/admin/kullanicilar" pendingApplications={pending}>
      <p className="text-sm">
        <Link href="/admin/kullanicilar" className="underline">
          ← Kullanıcılar
        </Link>
      </p>

      <AdminCard title={profile.full_name || "İsimsiz kullanıcı"} desc={`${email} · kayıt ${formatDate(profile.created_at)}`}>
        <div className="flex flex-wrap items-center gap-2">
          {roles.includes("admin") ? <AdminBadge tone="gold">Yönetici</AdminBadge> : <AdminBadge tone="mute">Öğrenci</AdminBadge>}
          {isSuspended ? <AdminBadge tone="warn">Askıda</AdminBadge> : null}
          <span className="text-sm">Kredi: {formatNumber(wallet?.balance ?? 0)}</span>
        </div>
        <div className="mt-3">
          <UserActions
            userId={profile.id}
            isAdmin={roles.includes("admin")}
            isTeacher={roles.includes("teacher") || roles.includes("verified_teacher")}
            isSelf={profile.id === actor.id}
            isSuspended={isSuspended}
          />
        </div>
      </AdminCard>

      <AdminCard title="Abonelik" desc="Elle uzatma denetim günlüğüne önce/sonra bitiş tarihiyle yazılır (plan 4.5).">
        {subscription ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              {plan ?? "Plan"} ·{" "}
              {subscriptionActive
                ? "etkin"
                : subscription.status === "active"
                  ? "süresi doldu"
                  : subscriptionStatusLabel(subscription.status as string)}{" "}
              · bitiş {subscription.current_period_end ? formatDate(subscription.current_period_end as string) : "—"}
              {isTrialPeriod(subscription as { trial_until: string | null; current_period_end: string | null }) ? " · beta denemesi (kodla)" : ""}
            </p>
            {subscriptionActive ? <SubscriptionExtend userId={profile.id} /> : null}
          </div>
        ) : (
          <p className="text-sm">Abonelik yok (ücretsiz). Telafi için kredi ekle.</p>
        )}
      </AdminCard>

      <AdminCard title="Hazırlıklar" desc="Salt okunur hazırlık görünümü: yol, konu, deneme durumları. Açılış denetim günlüğüne yazılır." bodyless>
        {preps?.length ? (
          <AdminTableFrame columns={["Hazırlık", "Sınav", "İlerleme", "Oluşturma"]}>
            {preps.map((prep) => {
              const entry = progress.get(prep.id as string) ?? { done: 0, total: 0 };
              return (
                <tr key={prep.id as string}>
                  <td>
                    <Link href={`/admin/kullanicilar/${profile.id}/hazirlik/${prep.id}`} className="underline">
                      {(prep.title as string) || "Adsız hazırlık"}
                    </Link>
                  </td>
                  <td className="adm-num text-xs">{prep.exam_date ? formatDate(prep.exam_date as string) : "—"}</td>
                  <td className="adm-num">
                    {entry.done} / {entry.total}
                  </td>
                  <td className="adm-num text-xs">{formatDate(prep.created_at as string)}</td>
                </tr>
              );
            })}
          </AdminTableFrame>
        ) : (
          <AdminEmpty title="Hazırlık yok">Bu öğrenci henüz sınav hazırlığı kurmadı.</AdminEmpty>
        )}
      </AdminCard>

      <AdminCard title="Son üretim hataları" desc="Ayrıntı ve takılı üretimler: /admin/ders-hatalari." bodyless>
        {failures?.length ? (
          <AdminTableFrame columns={["Zaman", "Tür", "Sebep", "Konu"]}>
            {failures.map((row, index) => (
              <tr key={`${row.created_at}-${index}`}>
                <td className="adm-num text-xs">{formatDate(row.created_at as string)}</td>
                <td>{nodeKindLabel(row.kind as string | null)}</td>
                <td>{failureReasonLabel(row.reason as string | null)}</td>
                <td className="text-xs">{(row.topic_label as string) ?? "—"}</td>
              </tr>
            ))}
          </AdminTableFrame>
        ) : (
          <AdminEmpty title="Hata yok">Bu öğrenciye ait üretim hatası kaydı yok.</AdminEmpty>
        )}
      </AdminCard>

      <AdminCard title="Son ödemeler" bodyless>
        {payments?.length ? (
          <AdminTableFrame columns={["Zaman", "Tutar", "Durum"]}>
            {payments.map((row) => (
              <tr key={row.id as string}>
                <td className="adm-num text-xs">{formatDate(row.created_at as string)}</td>
                <td className="adm-num">₺{formatNumber(Number(row.amount_try ?? 0))}</td>
                <td>{paymentStatusLabel(row.status as string)}</td>
              </tr>
            ))}
          </AdminTableFrame>
        ) : (
          <AdminEmpty title="Ödeme yok">Bu hesaptan ödeme gelmedi.</AdminEmpty>
        )}
      </AdminCard>

      <AdminNote tone="info">
        Öğrencinin ders metinleri, cevapları ve belgeleri burada gösterilmez. Gerekirse öğrenciden ekran görüntüsü
        istenir; içerik incelemesi KVKK aydınlatma metnindeki amaçla sınırlıdır.
      </AdminNote>
    </AdminShell>
  );
}
