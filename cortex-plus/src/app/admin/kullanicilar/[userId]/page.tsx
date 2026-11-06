import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminBadge, AdminCard, AdminEmpty, AdminNote, AdminTableFrame } from "@/components/admin/admin-ui";
import { SubscriptionExtend } from "@/components/admin/subscription-extend";
import { UserActions } from "@/components/admin/user-actions";
import { UserAccountTools, UserPlanTools, UserRewardTools } from "@/components/admin/user-manage-tools";
import { UserContentDelete, type DocumentRow, type PrepRow } from "@/components/admin/user-content-delete";
import { requireAdminPage } from "@/lib/auth/admin-guard";
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
import {
  documentStatusLabel,
  documentStatusTone,
  emailVerifiedState,
  formatFileSize,
  grantPlanLabel,
  grantablePlanOptions,
  targetAccountProblem,
  type GrantablePlanRow,
} from "@/lib/admin/user-manage-copy";

export const metadata = { title: "Yönetim · Kullanıcı" };
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Bir kullanıcının destek ve yönetim sayfası (19 Ekim 2026; 6 Kasım 2026'da yönetim araçları).
 *
 * Hesap, abonelik (tanımla, uzat, iptal), hediye kredi ve yıldız, e-posta onayı ve cihaz oturumları; hazırlık ve
 * belge listesi (yalnız ad, sayfa, boyut, durum — içerik değil), kurucu seçip kalıcı siler. Son üretim hataları ve
 * ödemeler. Öğrencinin ders metni, cevapları ve belge içeriği gösterilmez; hazırlık görünümü yalnız yapıyı gösterir
 * ve açılışı denetim günlüğüne yazılır. Her yazım denetim kaydına geçer.
 */
export default async function AdminKullaniciPage({ params }: { params: Promise<{ userId: string }> }) {
  const { user: actor, role: actorRole } = await requireAdminPage();
  const { userId } = await params;
  if (!UUID_RE.test(userId)) notFound();
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

  const [
    { data: subscription },
    { data: preps },
    { data: documents },
    { data: failures },
    { data: payments },
    { data: planRows },
    stars,
    devices,
  ] = await Promise.all([
    service
      .from("subscriptions")
      .select("id, status, current_period_end, trial_until, plans(name, slug)")
      .eq("user_id", userId)
      .order("current_period_end", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle(),
    service
      .from("exam_preps")
      .select("id, title, exam_type, exam_date, document_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100),
    service
      .from("documents")
      .select("id, file_name, page_count, size_bytes, status, created_at")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .is("part_of", null)
      .order("created_at", { ascending: false })
      .limit(100),
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
    service
      .from("plans")
      .select("id, slug, name, tier, is_premium, active, billing_period, monthly_allowance"),
    service
      .from("star_events")
      .select("amount")
      .eq("user_id", userId)
      .limit(10000)
      .then(({ data, error }) =>
        error ? null : (data ?? []).reduce((sum, row) => sum + Number((row as { amount?: number }).amount ?? 0), 0),
      ),
    service
      .from("user_device_sessions")
      .select("session_id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("revoked_at", null)
      .then(({ count, error }) => (error ? null : (count ?? 0))),
  ]);

  const prepIds = (preps ?? []).map((prep) => prep.id as string);
  const [{ data: nodeRows }, { data: topicRows }] = prepIds.length
    ? await Promise.all([
        service.from("exam_prep_nodes").select("exam_prep_id, status").in("exam_prep_id", prepIds),
        service.from("exam_prep_topics").select("exam_prep_id").in("exam_prep_id", prepIds),
      ])
    : [{ data: [] as { exam_prep_id: string; status: string }[] }, { data: [] as { exam_prep_id: string }[] }];
  const progress = new Map<string, { done: number; total: number }>();
  for (const row of nodeRows ?? []) {
    const entry = progress.get(row.exam_prep_id as string) ?? { done: 0, total: 0 };
    entry.total += 1;
    if (row.status === "done") entry.done += 1;
    progress.set(row.exam_prep_id as string, entry);
  }
  const topicCount = new Map<string, number>();
  for (const row of topicRows ?? []) {
    topicCount.set(row.exam_prep_id as string, (topicCount.get(row.exam_prep_id as string) ?? 0) + 1);
  }

  const prepList: PrepRow[] = (preps ?? []).map((prep) => {
    const entry = progress.get(prep.id as string) ?? { done: 0, total: 0 };
    return {
      id: prep.id as string,
      title: (prep.title as string) || "Adsız hazırlık",
      type: (prep.exam_type as string | null) || null,
      created: formatDate(prep.created_at as string),
      topics: topicCount.get(prep.id as string) ?? 0,
      steps: entry.total,
      done: entry.done,
      href: `/admin/kullanicilar/${profile.id}/hazirlik/${prep.id}`,
    };
  });
  const prepsByDocument = new Map<string, string[]>();
  for (const prep of preps ?? []) {
    const doc = prep.document_id as string | null;
    if (!doc) continue;
    prepsByDocument.set(doc, [...(prepsByDocument.get(doc) ?? []), (prep.title as string) || "Adsız hazırlık"]);
  }
  const documentList: DocumentRow[] = (documents ?? []).map((doc) => ({
    id: doc.id as string,
    name: (doc.file_name as string) || "Adsız belge",
    pages: (doc.page_count as number | null) ?? null,
    size: formatFileSize(doc.size_bytes as number | null),
    status: documentStatusLabel(doc.status as string | null),
    statusTone: documentStatusTone(doc.status as string | null),
    created: formatDate(doc.created_at as string),
    linkedPreps: prepsByDocument.get(doc.id as string) ?? [],
  }));

  const roles = (profile.user_roles ?? []).filter((role) => !role.revoked_at).map((role) => role.role as string);
  const wallet = profile.credit_wallets as { balance?: number } | null;
  const isSuspended = Boolean((profile as { suspended_at?: string | null }).suspended_at);
  const auth = authUser?.data?.user ?? null;
  const email = auth?.email ?? "—";
  const isSelf = profile.id === actor.id;
  const planRow = subscription?.plans as { name?: string; slug?: string } | null;
  const plan = planRow ? grantPlanLabel({ slug: planRow.slug ?? "", name: planRow.name ?? null }) : null;
  const subscriptionActive =
    subscription?.status === "active" &&
    (!subscription.current_period_end || new Date(subscription.current_period_end as string).getTime() > Date.now());
  const manageProblem = targetAccountProblem({
    actorId: actor.id,
    actorRole,
    targetId: profile.id,
    targetRoles: roles,
  });
  const deleteProblem = targetAccountProblem({
    actorId: actor.id,
    actorRole,
    targetId: profile.id,
    targetRoles: roles,
    destructive: true,
  });
  const planOptions = grantablePlanOptions((planRows ?? []) as GrantablePlanRow[]);

  return (
    <AdminShell href="/admin/kullanicilar" pendingApplications={pending}>
      <p className="flex flex-wrap gap-3 text-sm">
        <Link href="/admin/kullanicilar" className="underline">
          ← Kullanıcılar
        </Link>
        {isSelf ? null : (
          <Link href={`/admin/kullanicilar/${actor.id}`} className="underline">
            👤 Benim hesabım
          </Link>
        )}
      </p>

      <AdminCard
        title={profile.full_name || "İsimsiz kullanıcı"}
        desc={`${email} · kayıt ${formatDate(profile.created_at)}${isSelf ? " · bu senin hesabın" : ""}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          {roles.includes("founder") ? <AdminBadge tone="gold">Kurucu</AdminBadge> : roles.includes("admin") ? <AdminBadge tone="gold">Yönetici</AdminBadge> : <AdminBadge tone="mute">Öğrenci</AdminBadge>}
          {isSuspended ? <AdminBadge tone="warn">Askıda</AdminBadge> : null}
          {subscriptionActive && plan ? <AdminBadge tone="ok">{plan}</AdminBadge> : <AdminBadge tone="mute">Ücretsiz</AdminBadge>}
          <span className="text-sm">Hediye kredi: {formatNumber(wallet?.balance ?? 0)}</span>
          <span className="text-sm">Yıldız: {stars === null ? "—" : formatNumber(stars)}</span>
        </div>
        <div className="mt-3">
          <UserActions
            userId={profile.id}
            isAdmin={roles.includes("admin") || roles.includes("founder")}
            isTeacher={roles.includes("teacher") || roles.includes("verified_teacher")}
            isSelf={isSelf}
            isSuspended={isSuspended} canManageAdmins={actorRole === "founder" && !roles.includes("founder")}
          />
        </div>
      </AdminCard>

      <AdminCard
        title="Paket ve abonelik"
        desc="Plus, Sınav Haftası ya da Sigma'yı gün sayısıyla tanımla, süren dönemi uzat ya da iptal et. Ücret alınmaz; her işlem kayda geçer."
      >
        <div className="adm-tool-stack">
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
                {isTrialPeriod(subscription as { trial_until: string | null; current_period_end: string | null }) ? " · ücretsiz dönem (kod ya da panel)" : ""}
              </p>
              {subscriptionActive && !manageProblem ? <SubscriptionExtend userId={profile.id} /> : null}
            </div>
          ) : (
            <p className="text-sm">Abonelik yok (ücretsiz).</p>
          )}
          {manageProblem ? (
            <p className="adm-tool-hint">{manageProblem}</p>
          ) : (
            <UserPlanTools userId={profile.id} plans={planOptions} activePlanLabel={subscriptionActive ? plan ?? "Abonelik" : null} />
          )}
        </div>
      </AdminCard>

      <AdminCard title="Hediye kredi ve yıldız" desc="Destek telafisi ya da düzeltme için. Ödeme kaydı yazılmaz.">
        {manageProblem ? (
          <p className="adm-tool-hint">{manageProblem}</p>
        ) : (
          <UserRewardTools userId={profile.id} balance={wallet?.balance ?? 0} stars={stars} />
        )}
      </AdminCard>

      <AdminCard
        title="E-posta ve cihazlar"
        desc="Onay e-postası gelmeyen öğrenciyi onaylı işaretle; hesap en çok 2 cihazda açık kalır, takılan öğrenci için cihaz oturumlarını sıfırla."
      >
        {manageProblem ? (
          <p className="adm-tool-hint">{manageProblem}</p>
        ) : (
          <UserAccountTools
            userId={profile.id}
            emailState={emailVerifiedState(auth)}
            openDevices={devices}
            isSelf={isSelf}
          />
        )}
      </AdminCard>

      <AdminCard
        title="Hazırlıklar ve belgeler"
        desc="Hazırlığın adına tıklayınca salt okunur yol görünümü açılır (açılış kayda geçer). Kalıcı silme yalnız kurucuya açık ve iki adımlı onay ister."
      >
        <UserContentDelete
          userId={profile.id}
          preps={prepList}
          documents={documentList}
          canDelete={actorRole === "founder" && !deleteProblem}
        />
      </AdminCard>

      <AdminCard title="Son üretim hataları" desc="Ayrıntı ve takılı üretimler: Ders Hataları sayfası." bodyless>
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
        Öğrencinin ders metinleri, cevapları ve belge içerikleri burada gösterilmez; belgeler yalnız adı, sayfa sayısı,
        boyutu ve durumuyla listelenir. Gerekirse öğrenciden ekran görüntüsü istenir; içerik incelemesi KVKK aydınlatma
        metnindeki amaçla sınırlıdır.
      </AdminNote>
    </AdminShell>
  );
}
