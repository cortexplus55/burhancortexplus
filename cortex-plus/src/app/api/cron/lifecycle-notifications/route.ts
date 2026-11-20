import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { cronAuthorized } from "@/lib/notifications/cron-auth";
import { istanbulClock, isQuietHour } from "@/lib/notifications/schedule";
import { jobsForSlot } from "@/lib/notifications/jobs/plan";
import { runDailyReminders } from "@/lib/notifications/jobs/daily-reminders";
import { sweepQuotaAlerts } from "@/lib/notifications/quota-alert";
import {
  runActivation,
  runExamEve,
  runExpiryReminders,
  runFreeFirstUnit,
  runSmartTrap,
  runWeeklyDigest,
  type JobContext,
} from "@/lib/notifications/jobs/lifecycle";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Bütün işler bu süre içinde; kalan gönderim bir sonraki dilime değil, ertesi güne kalır (tekilleştirme korur). */
const RUN_BUDGET_MS = 240_000;

/**
 * Yaşam döngüsü bildirimleri (Faz 6, 20 Kasım 2026): `vercel.json` ile 30 dakikada bir. Eski günlük `study-reminders`
 * zamanlamasının yerine geçti (cron sayısı 2 kaldı). Her turda yalnız o yarım saat diliminin işleri koşar
 * (`jobsForSlot`); gece 22:00–08:00 arası hiçbir yaşam döngüsü işi çalışmaz (gönderim kilidi ayrıca engeller).
 *
 * Vercel Cron `Authorization: Bearer $CRON_SECRET` gönderir.
 */
export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const startedAt = Date.now();
  const now = new Date(startedAt);
  const clock = istanbulClock(now);
  const service = createServiceClient();
  // Hakkın %80'i: yalnız uygulama içi bildirim (e-posta değil), bu yüzden gece de koşar; en çok 20 sn.
  const quota = await sweepQuotaAlerts(service, { now, deadline: startedAt + 20_000 });
  if (isQuietHour(now)) return NextResponse.json({ ok: true, slot: `${clock.hour}:${clock.minute}`, quiet: true, quota, jobs: [] });

  const context: JobContext = { service, now, deadline: startedAt + RUN_BUDGET_MS };
  const results: Record<string, unknown> = { quota };
  for (const job of jobsForSlot(clock)) {
    if (Date.now() >= context.deadline) {
      results[job.kind] = "budget";
      continue;
    }
    try {
      switch (job.kind) {
        case "expiry":
          results.expiry = await runExpiryReminders(context);
          break;
        case "exam_eve":
          results.exam_eve = await runExamEve(context);
          break;
        case "activation":
          results.activation = await runActivation(context);
          break;
        case "weekly":
          results.weekly = await runWeeklyDigest(context);
          break;
        case "free_first_unit":
          results.free_first_unit = await runFreeFirstUnit(context);
          break;
        case "smart_trap":
          results[`smart_trap_${job.studyHour}`] = await runSmartTrap(context, job.studyHour);
          break;
        case "daily_reminders":
          results[`daily_${job.studyHour}`] = await runDailyReminders(service, {
            now,
            startedAt,
            studyHour: job.studyHour,
            dailyMails: job.dailyMails,
          });
          break;
      }
    } catch (error) {
      console.error("lifecycle_job_failed", { job: job.kind, error: String(error) });
      results[job.kind] = "failed";
    }
  }
  return NextResponse.json({ ok: true, slot: `${clock.hour}:${String(clock.minute).padStart(2, "0")}`, results });
}
