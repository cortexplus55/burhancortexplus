import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  RENEWAL_REMINDER_DAYS,
  daysUntil,
  hasExpired,
  isTrialPeriod,
  needsRenewalReminder,
  periodLabel,
  trialNotice,
  type BillingPeriod,
} from "@/lib/payments/subscription";
import { processPendingDeletionRequests } from "@/lib/privacy/account-deletion";
import { processPendingDocumentDeletions } from "@/lib/privacy/document-deletion";
import { logOpsEvent } from "@/lib/observability/ops-log";
import { cleanupExpiredUploads } from "@/lib/documents/upload-cleanup";
import { refundStalePendingReservations, refundAbandonedDocumentReservations } from "@/lib/credits/service";
import { sendDailyDigest } from "@/lib/admin/daily-digest";
import { sampleLessonQuality } from "@/lib/learning/lesson-quality-judge";

export const dynamic = "force-dynamic";
// Günlük kalite örneği (üç model çağrısı) özetten sonra çalışır; tur 300 sn'ye sığar.
export const maxDuration = 300;

/**
 * Yenileme hatırlatması ve dönem kapanışı.
 *
 * PayTR'da otomatik tahsilat bugün mümkün değil. Engeller tek yerde yazılı:
 * `src/lib/payments/paytr-capability.ts` → `RECURRING_BLOCKERS`. Kısaca kart
 * saklama yalnızca Direkt API'de var, biz iFrame API kullanıyoruz; üstelik
 * Direkt API kart numarasını bizim sunucumuzdan geçiriyor (PCI kapsamı).
 *
 * O yüzden abonelik kendiliğinden yenilenmiyor; bu iş bitişten üç gün önce
 * haber veriyor ve süresi dolanı kapatıyor. Engeller aşıldığında burası
 * `auto_renew = true` olan satırlar için tahsilata döner.
 *
 * Vercel Cron `Authorization: Bearer $CRON_SECRET` gönderir.
 */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

type SubRow = {
  id: string;
  user_id: string;
  status: string | null;
  billing_period: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  renewal_reminder_sent_at: string | null;
  expired_notified_at: string | null;
  cancel_at_period_end: boolean | null;
  trial_until?: string | null;
  plans: { name: string | null; billing_period: string | null } | null;
};

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  const now = new Date();
  // Bitişi üç günden uzaksa bu turda yapılacak bir şey yok.
  const horizon = new Date(
    now.getTime() + (RENEWAL_REMINDER_DAYS + 1) * 24 * 60 * 60 * 1000,
  );

  const { data, error } = await service
    .from("subscriptions")
    .select(
      `id, user_id, status, billing_period, current_period_start, current_period_end,
       renewal_reminder_sent_at, expired_notified_at, cancel_at_period_end, trial_until,
       plans(name, billing_period)`,
    )
    .eq("status", "active")
    .not("current_period_end", "is", null)
    .lte("current_period_end", horizon.toISOString())
    .limit(500);

  if (error) {
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  const rows = (data ?? []) as unknown as SubRow[];
  const notices: { user_id: string; title: string; body: string }[] = [];
  const reminded: string[] = [];
  const expired: string[] = [];

  for (const sub of rows) {
    const planName = sub.plans?.name ?? "Aboneliğin";
    const period = (sub.billing_period ??
      sub.plans?.billing_period ??
      "monthly") as BillingPeriod;

    // Kodla açılan Plus denemesi (kapalı beta): "yenile" değil, "ücretsize dönersin" denir.
    const trial = isTrialPeriod(sub);

    if (hasExpired(sub, now)) {
      expired.push(sub.id);
      if (!sub.expired_notified_at && trial) {
        notices.push({ user_id: sub.user_id, ...trialNotice("expired") });
      } else if (!sub.expired_notified_at) {
        notices.push({
          user_id: sub.user_id,
          title: `${planName} aboneliğin sona erdi`,
          body: sub.cancel_at_period_end
            ? `${planName} aboneliğin bugün kapandı. İstediğin an geri dönebilirsin — çalışman ve defterin yerinde duruyor.`
            : `${planName} aboneliğin bugün sona erdi. Yenilersen kaldığın yerden devam edersin; çalışman ve defterin yerinde duruyor.`,
        });
      }
      continue;
    }

    if (needsRenewalReminder(sub, now)) {
      const left = daysUntil(sub.current_period_end, now) ?? 0;
      const whenText =
        left <= 0 ? "bugün" : left === 1 ? "yarın" : `${left} gün sonra`;
      reminded.push(sub.id);
      if (trial) {
        notices.push({ user_id: sub.user_id, ...trialNotice("reminder", whenText) });
        continue;
      }
      notices.push({
        user_id: sub.user_id,
        title: `${planName} aboneliğin ${whenText} bitiyor`,
        body: `${periodLabel(period)} dönemin ${whenText} doluyor. Tek dokunuşla yenileyebilirsin; erken yenilersen kalan günlerin yanmaz, üstüne eklenir.`,
      });
    }
  }

  const stamp = now.toISOString();

  if (notices.length) {
    await service.from("notifications").insert(notices);
  }

  if (reminded.length) {
    await service
      .from("subscriptions")
      .update({ renewal_reminder_sent_at: stamp, updated_at: stamp })
      .in("id", reminded);
  }

  if (expired.length) {
    await service
      .from("subscriptions")
      .update({
        status: "inactive",
        expired_notified_at: stamp,
        updated_at: stamp,
      })
      .in("id", expired);
  }

  /*
    Veri silme kuyruğu da bu günlük işte akar.

    Vercel Hobby planı en fazla İKİ cron'a ve her birinde günde bir çalışmaya
    izin veriyor. 23 Eylül 2026'da üçüncü, saatlik bir `data-deletion` cron'u
    eklendi ve o andan itibaren HER production deploy sessizce reddedildi
    (GitHub statüsü "Deployment failed", Vercel'de kayıt yok). Kuyruk yedek
    bir tarayıcıdır — self-serve silme zaten anında purge deniyor — o yüzden
    günde bir tur yeterli. `/api/cron/data-deletion` elle tetikleme için duruyor.
  */
  let deletion: { processed: number; documents: number } | null = null;
  try {
    const documents = await processPendingDocumentDeletions(service);
    const processed = await processPendingDeletionRequests(service);
    deletion = { processed, documents };
  } catch {
    logOpsEvent("subscription_sync_failed", { stage: "deletion_queue" });
  }

  let expiredUploads = 0;
  try {
    expiredUploads = await cleanupExpiredUploads(service);
  } catch {
    logOpsEvent("document_upload_failed", { stage: "expired_cleanup" });
  }

  let staleReservations = 0;
  try {
    // Vercel 300 sn hard-kill sonrası pending kalan tek-istek rezervasyonlar.
    // force: kullanıcı cooldown'ı yok; DOCUMENT_PAGE_PROCESS allowlist dışı.
    staleReservations = await refundStalePendingReservations(service, {
      olderThanMs: 10 * 60_000,
      limit: 80,
      force: true,
    });
    staleReservations += await refundAbandonedDocumentReservations(service, {
      olderThanMs: 24 * 60 * 60_000,
      limit: 40,
    });
  } catch {
    logOpsEvent("credit_transaction_failed", { stage: "stale_reservations" });
  }

  /*
    Günlük özet e-postası da bu turun sonunda gider (plan 4.8): yeni kayıt, ödeme,
    üretim hatası, takılı üretim — kurucuya, operasyon adresine. Hobby'de üçüncü
    cron açılamadığı için ayrı iş değil; iade ve temizlik bittikten sonra sayılır
    ki özet o sabahki gerçek durumu anlatsın. Aynı gün ikinci kez gitmez.
  */
  let digest: { ok: boolean; reason?: string } = { ok: false, reason: "not_run" };
  try {
    const result = await sendDailyDigest(service, { now });
    digest = result.ok ? { ok: true } : { ok: false, reason: result.reason };
  } catch {
    logOpsEvent("subscription_sync_failed", { stage: "daily_digest" });
  }

  /*
    Günlük ders kalitesi örneği (23 Ekim 2026, ürün sahibinin kararı): önceki 24 saatin derslerinden üçü bağımsız
    bir yargıca puanlatılır (günde birkaç sent). Hobby'de yeni cron açılamadığı için bu turun içinde; özet
    e-postası gittikten sonra, ki yargıç gecikirse özet etkilenmesin.
  */
  let quality: { sampled: number; skipped: string | null } = { sampled: 0, skipped: "not_run" };
  try {
    quality = await sampleLessonQuality(service, { now, count: 3 });
  } catch {
    logOpsEvent("subscription_sync_failed", { stage: "lesson_quality_sample" });
  }

  return NextResponse.json({
    scanned: rows.length,
    reminded: reminded.length,
    expired: expired.length,
    notified: notices.length,
    deletion,
    expiredUploads,
    staleReservations,
    quality,
    digest,
  });
}
