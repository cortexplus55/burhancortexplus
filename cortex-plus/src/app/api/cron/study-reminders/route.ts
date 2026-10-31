import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { moreUrgent, pickReminder, type Reminder } from "@/lib/learning/study-reminder";
import { sendEmail } from "@/lib/email/mailer";
import { isFeatureEnabled, SPACED_REVIEW_FLAG } from "@/lib/admin/feature-flags";
import { istanbulDay } from "@/lib/istanbul-day";
import { examPrepDueReviewHref } from "@/lib/learning/exam-prep-hrefs";
import {
  dueReviewsByPrep,
  lastActivityByUser,
  reminderPrepPages,
  runWithBudget,
  undatedPrepIsLive,
  unfinishedPrepIds,
} from "@/lib/learning/reminder-facts";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** E-postalar bu kadar süre içinde gönderilir; kalan öğrenciler uygulama içi bildirimi yine alır. */
const MAIL_BUDGET_MS = 200_000;
const MAIL_CONCURRENCY = 4;
const INSERT_BATCH = 500;

/**
 * Günlük çalışma hatırlatması.
 *
 * Takvim kalktıktan sonra öğrenciyi yola geri çağıran tek şey bu. Günde
 * bir kez çalışıyor ve öğrenci başına EN FAZLA BİR bildirim bırakıyor;
 * kural `study-reminder.ts` içinde ve sınanıyor.
 *
 * Uygulama içi bildirim herkese, e-posta yalnızca kapatmamış olana.
 * Kapatılamayan e-posta gönderilmez; tercih profiles.study_reminder_email
 * kolonunda ve ayarlar ekranından tek tıkla kapanıyor. Kolon henüz
 * yoksa e-posta gönderilmiyor — sorgu hata verdiğinde liste boş kalıyor.
 *
 * 31 Ekim 2026 (lansman zırhı): hazırlıklar 100'erli sayfalarla okunur, sayılar SQL'den gelir (reminder-facts.ts);
 * tarihsiz hazırlıklar da hatırlatılır; e-postalar sınırlı eşzamanlılık ve süreyle gider.
 *
 * Vercel Cron `Authorization: Bearer $CRON_SECRET` gönderir.
 */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return (request.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://cortexplus.app";

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const service = createServiceClient();
  const now = new Date();
  const today = isoDay(now);
  const yesterday = isoDay(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  // Günü gelen tekrar (20 Ekim 2026): yeni cron yok (Hobby: en çok 2); aynı günlük bildirimin içinde.
  const spacedReview = await isFeatureEnabled(service, SPACED_REVIEW_FLAG).catch(() => false);

  // Öğrenci başına EN ACİL aday. Eskiden sorgudan ilk dönen hazırlık
  // kazanıyordu; sınavına iki gün kalmış öğrenci sırf satır sırası yüzünden
  // "kaldığın yer seni bekliyor" mesajı alabiliyordu.
  const best = new Map<
    string,
    { reminder: Reminder; daysUntilExam: number | null; prepTitle: string; link: string }
  >();
  const notifiedToday = new Set<string>();
  let checked = 0;

  // Sınavı geçmemiş ya da tarihsiz hazırlıklar. Bitmiş yolu olan öğrenciye hatırlatma
  // gitmiyor; istisna (20 Ekim 2026): günü gelen tekrarı olan hazırlık, yolu bitmiş olsa da hatırlatılır.
  for await (const preps of reminderPrepPages(service, today)) {
    checked += preps.length;
    const userIds = [...new Set(preps.map((prep) => prep.user_id))];
    const prepIds = preps.map((prep) => prep.id);
    const [unfinishedByPrep, lastActivity, { data: streaks }, { data: sentToday }, dueByPrep] = await Promise.all([
      unfinishedPrepIds(service, prepIds),
      lastActivityByUser(service, userIds),
      service
        .from("user_streaks")
        .select("user_id, current_streak, last_activity_date")
        .in("user_id", userIds),
      service
        .from("notifications")
        .select("user_id, created_at")
        .in("user_id", userIds)
        .gte("created_at", `${today}T00:00:00Z`),
      spacedReview ? dueReviewsByPrep(service, prepIds, istanbulDay(now)) : Promise.resolve(new Map<string, number>()),
    ]);
    for (const row of sentToday ?? []) notifiedToday.add(row.user_id as string);
    const streakByUser = new Map((streaks ?? []).map((row) => [row.user_id as string, row]));

    for (const prep of preps) {
      const userId = prep.user_id;
      const prepId = prep.id;
      const unfinished = unfinishedByPrep.has(prepId);
      const dueReviews = dueByPrep.get(prepId) ?? 0;
      // Yolu bitmiş hazırlıkta da tekrar günü gelmişse hatırlatılır.
      if (!unfinished && !dueReviews) continue;

      const last = lastActivity.get(userId);
      // Tarihsiz hazırlık (31 Ekim 2026): yalnız son 21 günde kurulmuş ya da çalışılmışsa.
      if (!undatedPrepIsLive(prep, last, now)) continue;
      const hoursSinceActivity = last
        ? (now.getTime() - Date.parse(last)) / (60 * 60 * 1000)
        : null;

      const examDate = prep.exam_date;
      const daysUntilExam = examDate
        ? Math.round(
            (Date.parse(`${examDate}T00:00:00Z`) -
              Date.parse(`${today}T00:00:00Z`)) /
              (24 * 60 * 60 * 1000),
          )
        : null;

      const streak = streakByUser.get(userId);
      const reminder = pickReminder({
        hasUnfinishedPath: unfinished,
        hoursSinceActivity,
        daysUntilExam,
        streakDays: (streak?.current_streak as number | null) ?? 0,
        streakBreaksToday:
          (streak?.last_activity_date as string | null) === yesterday,
        alreadyNotifiedToday: notifiedToday.has(userId),
        dueReviews,
      });
      if (!reminder) continue;

      const candidate = {
        reminder,
        daysUntilExam,
        prepTitle: prep.title ?? "Sınav hazırlığın",
        // Tekrar hatırlatması (ya da yolu bitmiş hazırlıkta tekrarlı sınav uyarısı) doğrudan tekrara açar.
        link:
          reminder.kind === "review" || (dueReviews > 0 && !unfinished)
            ? `${APP_URL}${examPrepDueReviewHref(prepId)}`
            : `${APP_URL}/deneme-sinavlari`,
      };
      const current = best.get(userId);
      if (!current || moreUrgent(candidate, current) < 0) {
        best.set(userId, candidate);
      }
    }
  }

  // Öğrencinin hazırlıkları iki sayfaya bölünmüşse sonraki sayfa bugünkü bildirimini görmüş olabilir: son süzgeç.
  const rows = [...best.entries()]
    .filter(([userId]) => !notifiedToday.has(userId))
    .map(([userId, pick]) => ({
      user_id: userId,
      title: pick.reminder.title,
      body: `${pick.prepTitle} — ${pick.reminder.body}`,
    }));

  if (!rows.length) {
    return NextResponse.json({ ok: true, checked, sent: 0, mailed: 0 });
  }

  for (let from = 0; from < rows.length; from += INSERT_BATCH) {
    await service.from("notifications").insert(rows.slice(from, from + INSERT_BATCH));
  }

  // E-posta yalnızca kapatmamış olana. Kolon yoksa sorgu hata verir ve
  // kimseye posta gitmez — migration uygulanmadan gönderim açılmıyor.
  const optedIn: string[] = [];
  for (let from = 0; from < rows.length; from += 100) {
    const { data } = await service
      .from("profiles")
      .select("id")
      .in(
        "id",
        rows.slice(from, from + 100).map((row) => row.user_id),
      )
      .eq("study_reminder_email", true);
    for (const profile of data ?? []) optedIn.push(profile.id as string);
  }

  // Sınırlı eşzamanlılık ve süre (31 Ekim 2026): sırayla gönderim yüzlerce öğrencide işlevin 300 sn'sini aşardı.
  const rowByUser = new Map(rows.map((row) => [row.user_id, row]));
  const mail = await runWithBudget(
    optedIn,
    async (userId) => {
      const row = rowByUser.get(userId);
      if (!row) return false;
      const link = best.get(userId)?.link ?? `${APP_URL}/deneme-sinavlari`;
      const { data: account } = await service.auth.admin.getUserById(userId);
      const to = account?.user?.email;
      if (!to) return false;
      const result = await sendEmail({
        to,
        subject: row.title,
        text: `${row.body}

Yoluna dön: ${link}

Bu hatırlatmayı ayarlardan kapatabilirsin.`,
        html:
          `<p>${row.body}</p>` +
          `<p><a href="${link}">Yoluna dön</a></p>` +
          `<p style="color:#666;font-size:12px">Bu hatırlatmayı ayarlardan kapatabilirsin.</p>`,
      });
      return result.ok;
    },
    { concurrency: MAIL_CONCURRENCY, deadline: startedAt + MAIL_BUDGET_MS },
  );
  if (mail.skipped) console.warn("study_reminder_mail_budget", { skipped: mail.skipped, mailed: mail.done });

  return NextResponse.json({
    ok: true,
    checked,
    sent: rows.length,
    mailed: mail.done,
    mailSkipped: mail.skipped,
  });
}
