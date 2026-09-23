import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import {
  RENEWAL_REMINDER_DAYS,
  daysUntil,
  hasExpired,
  needsRenewalReminder,
  periodLabel,
  type BillingPeriod,
} from "@/lib/payments/subscription";
import { processPendingDeletionRequests } from "@/lib/privacy/account-deletion";
import { processPendingDocumentDeletions } from "@/lib/privacy/document-deletion";
import { logOpsEvent } from "@/lib/observability/ops-log";

export const dynamic = "force-dynamic";

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
       renewal_reminder_sent_at, expired_notified_at, cancel_at_period_end,
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

    if (hasExpired(sub, now)) {
      expired.push(sub.id);
      if (!sub.expired_notified_at) {
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

  return NextResponse.json({
    scanned: rows.length,
    reminded: reminded.length,
    expired: expired.length,
    notified: notices.length,
    deletion,
  });
}
