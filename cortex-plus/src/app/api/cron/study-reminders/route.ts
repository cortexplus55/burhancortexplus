import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { pickReminder } from "@/lib/learning/study-reminder";

export const dynamic = "force-dynamic";

/**
 * Günlük çalışma hatırlatması.
 *
 * Takvim kalktıktan sonra öğrenciyi yola geri çağıran tek şey bu. Günde
 * bir kez çalışıyor ve öğrenci başına EN FAZLA BİR bildirim bırakıyor;
 * kural `study-reminder.ts` içinde ve sınanıyor.
 *
 * Şimdilik yalnızca uygulama içi bildirim yazıyor. E-posta bilerek
 * kapalı: kapatma ayarı için bir alan yok ve kapatılamayan e-posta
 * gönderilmez.
 *
 * Vercel Cron `Authorization: Bearer $CRON_SECRET` gönderir.
 */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (request.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  const now = new Date();
  const today = isoDay(now);
  const yesterday = isoDay(new Date(now.getTime() - 24 * 60 * 60 * 1000));

  // Sınavı geçmemiş hazırlıklar. Bitmiş yolu olan öğrenciye hatırlatma
  // gitmiyor; bunu düğüm durumlarından anlıyoruz.
  const { data: preps } = await service
    .from("exam_preps")
    .select("id, user_id, title, exam_date")
    .gte("exam_date", today)
    .limit(2000);

  if (!preps?.length) {
    return NextResponse.json({ ok: true, checked: 0, sent: 0 });
  }

  const userIds = [...new Set(preps.map((prep) => prep.user_id as string))];

  const [{ data: nodes }, { data: attempts }, { data: streaks }, { data: sentToday }] =
    await Promise.all([
      service
        .from("exam_prep_nodes")
        .select("exam_prep_id, status")
        .in(
          "exam_prep_id",
          preps.map((prep) => prep.id as string),
        ),
      service
        .from("exam_prep_node_attempts")
        .select("user_id, updated_at")
        .in("user_id", userIds)
        .order("updated_at", { ascending: false })
        .limit(5000),
      service
        .from("user_streaks")
        .select("user_id, current_streak, last_activity_date")
        .in("user_id", userIds),
      service
        .from("notifications")
        .select("user_id, created_at")
        .in("user_id", userIds)
        .gte("created_at", `${today}T00:00:00Z`),
    ]);

  const unfinishedByPrep = new Set(
    (nodes ?? [])
      .filter((node) => node.status !== "done")
      .map((node) => node.exam_prep_id as string),
  );

  // En son etkinlik kullanıcı başına; sorgu zaten tarihe göre sıralı.
  const lastActivity = new Map<string, string>();
  for (const attempt of attempts ?? []) {
    const userId = attempt.user_id as string;
    if (!lastActivity.has(userId)) {
      lastActivity.set(userId, attempt.updated_at as string);
    }
  }

  const streakByUser = new Map(
    (streaks ?? []).map((row) => [row.user_id as string, row]),
  );
  const notifiedToday = new Set(
    (sentToday ?? []).map((row) => row.user_id as string),
  );

  const rows: { user_id: string; title: string; body: string }[] = [];
  const seen = new Set<string>();

  for (const prep of preps) {
    const userId = prep.user_id as string;
    // Bir öğrencinin birden çok hazırlığı olabilir; ilk uygun olan yeter.
    if (seen.has(userId)) continue;
    if (!unfinishedByPrep.has(prep.id as string)) continue;

    const last = lastActivity.get(userId);
    const hoursSinceActivity = last
      ? (now.getTime() - Date.parse(last)) / (60 * 60 * 1000)
      : null;

    const examDate = prep.exam_date as string | null;
    const daysUntilExam = examDate
      ? Math.round(
          (Date.parse(`${examDate}T00:00:00Z`) -
            Date.parse(`${today}T00:00:00Z`)) /
            (24 * 60 * 60 * 1000),
        )
      : null;

    const streak = streakByUser.get(userId);
    const reminder = pickReminder({
      hasUnfinishedPath: true,
      hoursSinceActivity,
      daysUntilExam,
      streakDays: (streak?.current_streak as number | null) ?? 0,
      streakBreaksToday:
        (streak?.last_activity_date as string | null) === yesterday,
      alreadyNotifiedToday: notifiedToday.has(userId),
    });
    if (!reminder) continue;

    seen.add(userId);
    rows.push({
      user_id: userId,
      title: reminder.title,
      body: `${prep.title ?? "Sınav hazırlığın"} — ${reminder.body}`,
    });
  }

  if (rows.length) {
    await service.from("notifications").insert(rows);
  }

  return NextResponse.json({ ok: true, checked: preps.length, sent: rows.length });
}
