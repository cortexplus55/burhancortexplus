import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { runDailyReminders } from "@/lib/notifications/jobs/daily-reminders";
import { cronAuthorized } from "@/lib/notifications/cron-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Günlük çalışma hatırlatması, elle tetikleme (Faz 6, 20 Kasım 2026). Zamanlanmış çalışma artık
 * `/api/cron/lifecycle-notifications` içinde (30 dakikada bir, öğrencinin seçtiği saatte). Bu uç yalnız elle çağrılır:
 * saat süzgeci olmadan herkesi ele alır; aynı gün ikinci kez çalışsa da tekilleştirme anahtarları çift bildirim ve
 * çift e-posta üretmez.
 *
 * Vercel Cron `Authorization: Bearer $CRON_SECRET` gönderir.
 */
export async function GET(request: Request) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const result = await runDailyReminders(createServiceClient(), {
    now: new Date(),
    startedAt: Date.now(),
    studyHour: null,
    dailyMails: true,
  });
  return NextResponse.json({ ok: true, ...result });
}
