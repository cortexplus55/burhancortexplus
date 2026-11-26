import { NextResponse } from "next/server";
import { withUser } from "@/lib/api/guards";
import { istanbulDay } from "@/lib/istanbul-day";
import { lastActivityByUser, undatedPrepIsLive, unfinishedPrepIds } from "@/lib/learning/reminder-facts";
import { buildLocalReminderPlan, pickReminderPrep, type ReminderPrepCandidate } from "@/lib/notifications/local-reminders";
import { loadNotificationPreferences } from "@/lib/notifications/preferences";

/**
 * Mobil uygulamanın yerel çalışma hatırlatması (26 Kasım 2026, mobil 1. adım). Yalnız okur: öğrencinin tercihleri,
 * bitmemiş yolu olan hazırlıkları ve bugün çalışıp çalışmadığı; dönen planı uygulama telefonda kurar
 * (`native-reminders.ts`). Kural ve metinler `local-reminders.ts`te.
 */
export async function GET(request: Request) {
  const guard = await withUser(request, { scope: "app-reminders", limit: 20 });
  if (!guard.ok) return guard.response;
  const { service, userId } = guard.ctx;
  const now = new Date();
  const today = istanbulDay(now);

  try {
    const [preferences, prepsResult, lastActivity] = await Promise.all([
      loadNotificationPreferences(service, userId),
      service
        .from("exam_preps")
        .select("id, title, exam_date, exam_type, created_at")
        .eq("user_id", userId)
        .or(`exam_date.gte.${today},exam_date.is.null`)
        .order("created_at", { ascending: false })
        .limit(20),
      lastActivityByUser(service, [userId]),
    ]);
    const preps = (prepsResult.data ?? []) as ReminderPrepCandidate[];
    const last = lastActivity.get(userId);
    const unfinished = preps.length ? await unfinishedPrepIds(service, preps.map((prep) => prep.id)) : new Set<string>();
    const prep = pickReminderPrep(preps, unfinished, (candidate) => undatedPrepIsLive(candidate, last, now));
    const plan = buildLocalReminderPlan({
      now,
      inAppNotifications: preferences.inAppNotifications,
      studyHour: preferences.preferredStudyHour,
      prep: prep ? { id: prep.id, title: prep.title, examDate: prep.exam_date } : null,
      studiedToday: last ? istanbulDay(new Date(last)) === today : false,
    });
    return NextResponse.json(plan, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("app_reminders_failed", { error: String(error) });
    return NextResponse.json({ error: "reminders_unavailable" }, { status: 503 });
  }
}
