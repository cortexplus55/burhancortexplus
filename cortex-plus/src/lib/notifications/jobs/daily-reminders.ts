import type { SupabaseClient } from "@supabase/supabase-js";
import { moreUrgent, pickReminder, reminderEmailSubject, type Reminder } from "@/lib/learning/study-reminder";
import { renderReminderMail } from "@/lib/email/templates";
import { sendReferralGiftMails, sendReferralInviteMails, verifiedUserIds } from "@/lib/email/daily-mails";
import { sendWelcomeCatchUp } from "@/lib/email/lifecycle";
import { isFeatureEnabled, SPACED_REVIEW_FLAG } from "@/lib/admin/feature-flags";
import { istanbulDay } from "@/lib/istanbul-day";
import { examPrepDueReviewHref } from "@/lib/learning/exam-prep-hrefs";
import { missingRelation } from "@/lib/learning/missing-column";
import {
  dueReviewsByPrep,
  lastActivityByUser,
  reminderPrepPages,
  runWithBudget,
  undatedPrepIsLive,
  unfinishedPrepIds,
} from "@/lib/learning/reminder-facts";
import { notifyInAppMany } from "@/lib/notifications/in-app";
import { loadPreferencesMap, type NotificationPreferences } from "@/lib/notifications/preferences";
import { dedupeKeys } from "@/lib/notifications/dispatch-guard";
import { sendGuardedMail } from "@/lib/notifications/send";

/** E-postalar bu kadar süre içinde gönderilir; kalan öğrenciler uygulama içi bildirimi yine alır. */
export const MAIL_BUDGET_MS = 200_000;
const MAIL_CONCURRENCY = 4;

/**
 * Günlük çalışma hatırlatması (Faz 6'da `study-reminders` rotasından taşındı, 20 Kasım 2026).
 *
 * Öğrenciyi yola geri çağıran iş. Öğrenci başına EN FAZLA BİR hatırlatma, kural `study-reminder.ts`te ve sınanıyor.
 * Faz 6 ile: öğrencinin seçtiği saatte (18:30 / 19:00 / 20:00 / 21:00; `slot` verilince yalnız o saati seçenler),
 * tercihleri `user_notification_preferences`ten (uygulama içi ve e-posta ayrı anahtar), e-posta gönderim kilidinden
 * geçer (gece sessizliği, 24 saat kuralı, günde bir kez). E-posta yalnız doğrulanmış adrese ve abonelikten çıkma
 * bağlantısıyla.
 *
 * 31 Ekim 2026 (lansman zırhı): hazırlıklar 100'erli sayfalarla okunur, sayılar SQL'den gelir (reminder-facts.ts);
 * tarihsiz hazırlıklar da hatırlatılır; e-postalar sınırlı eşzamanlılık ve süreyle gider.
 */
export type DailyReminderOptions = {
  now: Date;
  startedAt: number;
  /** Yalnız bu saati seçmiş öğrenciler (cron dilimi). Verilmezse herkes (elle tetikleme). */
  studyHour?: number | null;
  /** Davet, hediye ve hoş geldin telafisi bu turda da koşsun mu (günde bir dilimde). */
  dailyMails: boolean;
};

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Bugün hatırlatma bildirimi almış öğrenciler: yeni tabloda tür, eski tabloda (göç öncesi) herhangi bir bildirim. */
async function notifiedToday(service: SupabaseClient, userIds: string[], todayStartIso: string): Promise<Set<string>> {
  const out = new Set<string>();
  const fresh = await service
    .from("in_app_notifications")
    .select("user_id")
    .in("user_id", userIds)
    .eq("kind", "study_reminder")
    .gte("created_at", todayStartIso);
  if (!fresh.error) for (const row of (fresh.data ?? []) as { user_id: string }[]) out.add(row.user_id);
  if (fresh.error && missingRelation(fresh.error)) {
    const legacy = await service.from("notifications").select("user_id").in("user_id", userIds).gte("created_at", todayStartIso);
    for (const row of (legacy.data ?? []) as { user_id: string }[]) out.add(row.user_id);
  }
  return out;
}

export async function runDailyReminders(service: SupabaseClient, options: DailyReminderOptions) {
  const { now, startedAt } = options;
  const today = isoDay(now);
  const yesterday = isoDay(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  // Günü gelen tekrar (20 Ekim 2026): aynı günlük bildirimin içinde.
  const spacedReview = await isFeatureEnabled(service, SPACED_REVIEW_FLAG).catch(() => false);

  // Öğrenci başına EN ACİL aday (sınavına iki gün kalmış öğrenci satır sırası yüzünden "kaldığın yer" mesajı almasın).
  const best = new Map<string, { reminder: Reminder; daysUntilExam: number | null; prepTitle: string; path: string }>();
  const alreadyNotified = new Set<string>();
  const preferences = new Map<string, NotificationPreferences>();
  let checked = 0;

  // Sınavı geçmemiş ya da tarihsiz hazırlıklar. Bitmiş yolu olan öğrenciye hatırlatma gitmiyor; istisna (20 Ekim 2026):
  // günü gelen tekrarı olan hazırlık, yolu bitmiş olsa da hatırlatılır.
  for await (const preps of reminderPrepPages(service, today)) {
    checked += preps.length;
    const pageUsers = [...new Set(preps.map((prep) => prep.user_id))];
    const prefs = await loadPreferencesMap(service, pageUsers);
    if (!prefs) continue;
    // Seçtiği saat bu dilim değilse öğrenci bu turda yok (öbür dilimde ele alınır).
    const userIds = pageUsers.filter((userId) => options.studyHour == null || prefs.get(userId)?.preferredStudyHour === options.studyHour);
    if (!userIds.length) continue;
    for (const userId of userIds) preferences.set(userId, prefs.get(userId)!);
    const scoped = preps.filter((prep) => userIds.includes(prep.user_id));
    const prepIds = scoped.map((prep) => prep.id);
    const [unfinishedByPrep, lastActivity, { data: streaks }, sentToday, dueByPrep] = await Promise.all([
      unfinishedPrepIds(service, prepIds),
      lastActivityByUser(service, userIds),
      service.from("user_streaks").select("user_id, current_streak, last_activity_date").in("user_id", userIds),
      notifiedToday(service, userIds, `${today}T00:00:00Z`),
      spacedReview ? dueReviewsByPrep(service, prepIds, istanbulDay(now)) : Promise.resolve(new Map<string, number>()),
    ]);
    for (const userId of sentToday) alreadyNotified.add(userId);
    const streakByUser = new Map((streaks ?? []).map((row) => [row.user_id as string, row]));

    for (const prep of scoped) {
      const userId = prep.user_id;
      const prepId = prep.id;
      const unfinished = unfinishedByPrep.has(prepId);
      const dueReviews = dueByPrep.get(prepId) ?? 0;
      if (!unfinished && !dueReviews) continue;

      const last = lastActivity.get(userId);
      // Tarihsiz hazırlık (31 Ekim 2026): yalnız son 21 günde kurulmuş ya da çalışılmışsa.
      if (!undatedPrepIsLive(prep, last, now)) continue;
      const hoursSinceActivity = last ? (now.getTime() - Date.parse(last)) / (60 * 60 * 1000) : null;
      const examDate = prep.exam_date;
      const daysUntilExam = examDate
        ? Math.round((Date.parse(`${examDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / (24 * 60 * 60 * 1000))
        : null;

      const streak = streakByUser.get(userId);
      const reminder = pickReminder({
        hasUnfinishedPath: unfinished,
        hoursSinceActivity,
        daysUntilExam,
        streakDays: (streak?.current_streak as number | null) ?? 0,
        streakBreaksToday: (streak?.last_activity_date as string | null) === yesterday,
        alreadyNotifiedToday: alreadyNotified.has(userId),
        dueReviews,
        // Bugün (İstanbul günü) çalışmış öğrenciye sınava kalan gün nudge'ı gitmez (7 Kasım 2026).
        studiedToday: last ? istanbulDay(new Date(last)) === istanbulDay(now) : false,
      });
      if (!reminder) continue;

      const candidate = {
        reminder,
        daysUntilExam,
        prepTitle: prep.title ?? "Sınav hazırlığın",
        // Tekrar hatırlatması (ya da yolu bitmiş hazırlıkta tekrarlı sınav uyarısı) doğrudan tekrara açar.
        path: reminder.kind === "review" || (dueReviews > 0 && !unfinished) ? examPrepDueReviewHref(prepId) : `/deneme-sinavlari/${prepId}`,
      };
      const current = best.get(userId);
      if (!current || moreUrgent(candidate, current) < 0) best.set(userId, candidate);
    }
  }

  const picks = [...best.entries()].filter(([userId]) => !alreadyNotified.has(userId));

  // Uygulama içi: öğrenci kapatmadıysa; günde bir (tekilleştirme anahtarı).
  const inApp = picks
    .filter(([userId]) => preferences.get(userId)?.inAppNotifications !== false)
    .map(([userId, pick]) => ({
      userId,
      kind: "study_reminder" as const,
      title: pick.reminder.title,
      body: `${pick.prepTitle} — ${pick.reminder.body}`,
      actionUrl: pick.path,
      dedupeKey: `study_reminder:${today}`,
    }));
  const sent = await notifyInAppMany(service, inApp);

  // E-posta: tercih açık + doğrulanmış adres (7 Kasım 2026: başkasının adresiyle açılmış hesaba her akşam e-posta gitmesin).
  const optedIn = picks.filter(([userId]) => preferences.get(userId)?.studyRemindersEmail !== false).map(([userId]) => userId);
  const verified = optedIn.length ? await verifiedUserIds(service, optedIn) : new Set<string>();
  if (!verified) console.warn("study_reminder_verified_unknown", { candidates: optedIn.length });
  const mailable = verified ? optedIn.filter((userId) => verified.has(userId)) : [];

  const mail = await runWithBudget(
    mailable,
    async (userId) => {
      const pick = best.get(userId);
      if (!pick) return false;
      const outcome = await sendGuardedMail(service, {
        userId,
        templateKey: "study_reminder",
        dedupeKey: dedupeKeys.studyReminder(userId, today),
        category: "lifecycle",
        unsubscribe: "studyRemindersEmail",
        now,
        render: ({ origin, preferencesUrl, firstName }) =>
          renderReminderMail({
            subject: reminderEmailSubject(pick.reminder, pick.daysUntilExam),
            daysLeft: pick.daysUntilExam,
            prepTitle: pick.prepTitle,
            headline: pick.reminder.title,
            line: pick.reminder.body,
            ctaUrl: `${origin}${pick.path}`,
            unsubscribeUrl: preferencesUrl ?? `${origin}/ayarlar`,
            firstName,
          }),
      });
      return outcome === "sent";
    },
    { concurrency: MAIL_CONCURRENCY, deadline: startedAt + MAIL_BUDGET_MS },
  );
  if (mail.skipped) console.warn("study_reminder_mail_budget", { skipped: mail.skipped, mailed: mail.done });

  // Davet e-postası, hediye bildirimi ve hoş geldin telafisi (günde bir dilimde): hatırlatma çıkmasa da koşar.
  let referral: Record<string, unknown> | null = null;
  if (options.dailyMails) {
    const hediye = await sendReferralGiftMails(service, { deadline: startedAt + MAIL_BUDGET_MS }).catch(() => ({ mailed: 0, skipped: 0 }));
    const davet = await sendReferralInviteMails(service, { deadline: startedAt + MAIL_BUDGET_MS }).catch(() => ({ mailed: 0, skipped: 0, reason: "hata" }));
    // Hoş geldin telafisi (8 Kasım 2026): kurulumu bitip e-postası gitmemiş hesaplar (Resend o an düşmüş olabilir).
    const hosgeldin = await sendWelcomeCatchUp(service, { deadline: startedAt + MAIL_BUDGET_MS }).catch(() => ({ mailed: 0, skipped: 0 }));
    referral = {
      gift: hediye.mailed,
      invite: davet.mailed,
      welcome: hosgeldin.mailed,
      inviteReason: "reason" in davet ? davet.reason : undefined,
    };
  }

  return { checked, sent, mailed: mail.done, mailSkipped: mail.skipped, referral };
}
