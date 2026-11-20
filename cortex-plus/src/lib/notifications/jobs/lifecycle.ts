import type { SupabaseClient } from "@supabase/supabase-js";
import { verifiedUserIds } from "@/lib/email/daily-mails";
import { isFeatureEnabled, MARKETING_EMAIL_FLAG } from "@/lib/admin/feature-flags";
import { isTrialPeriod } from "@/lib/payments/subscription";
import { plusOnlyLocked, pathSkipKinds } from "@/lib/billing/node-free-meter";
import { firstLessonStatus } from "@/lib/billing/free-topic-gate";
import { STUDIO_EXAM_TYPE } from "@/lib/learning/studio-exam";
import { withoutOutcomeCode } from "@/lib/learning/path-labels";
import { lastActivityByUser, runWithBudget } from "@/lib/learning/reminder-facts";
import { loadContinueStep } from "@/lib/learning/prep-cards";
import {
  MASTERY_ROW_COLUMNS,
  masterySnapshotFromRow,
  scoreTopicMastery,
  topicMasteryView,
} from "@/lib/learning/learning-tracking";
import { renderSubscriptionExpiryReminder } from "@/lib/email/templates/subscription-expiry-reminder";
import { renderExamEveCheatSheet } from "@/lib/email/templates/exam-eve-cheat-sheet";
import { renderSmartTrapNudge } from "@/lib/email/templates/smart-trap-nudge";
import { renderActivation24h } from "@/lib/email/templates/activation-24h";
import { renderFreeFirstUnitCompleted } from "@/lib/email/templates/free-first-unit-completed";
import { renderWeeklyStudyDigest } from "@/lib/email/templates/weekly-study-digest";
import { dedupeKeys } from "@/lib/notifications/dispatch-guard";
import { loadPreferencesMap, type NotificationPreferences, type PreferenceKey } from "@/lib/notifications/preferences";
import { daysBetween, istanbulClock, isoWeekOf } from "@/lib/notifications/schedule";
import { sendGuardedMail, type SendOutcome } from "@/lib/notifications/send";

/**
 * Yaşam döngüsü e-postaları (Faz 6, 20 Kasım 2026). Her iş kendi dilimde çalışır (cron 30 dakikada bir); aday seçimi
 * veriden, gönderim `sendGuardedMail` ile (gece sessizliği, 24 saat kuralı, tekilleştirme, abonelikten çıkma bağlantısı).
 * Yalnız doğrulanmış e-posta adresine. Hiçbir iş öbürünü durdurmaz; okuma düşerse iş o turda boş döner.
 */

export type JobContext = {
  service: SupabaseClient;
  now: Date;
  /** Bu turun son anı (ms); kalan iş bir sonraki tura kalır. */
  deadline: number;
};

/** "not_due": aday bu turda koşulu tutmadı (ör. 1. konu henüz bitmedi). */
export type JobOutcome = SendOutcome | "not_due";

export type JobReport = { candidates: number; sent: number; outcomes: Partial<Record<JobOutcome, number>> };

const MAIL_CONCURRENCY = 4;
const PAGE = 500;

function emptyReport(): JobReport {
  return { candidates: 0, sent: 0, outcomes: {} };
}

/** Adaylar: tercihi açık ve adresi doğrulanmış olanlar (sıra korunur). Okuma düşerse boş. */
async function eligible(
  service: SupabaseClient,
  userIds: readonly string[],
  preference: PreferenceKey,
): Promise<{ ids: string[]; preferences: Map<string, NotificationPreferences> }> {
  const unique = [...new Set(userIds)];
  if (!unique.length) return { ids: [], preferences: new Map() };
  const preferences = await loadPreferencesMap(service, unique);
  if (!preferences) return { ids: [], preferences: new Map() };
  const wanted = unique.filter((id) => preferences.get(id)?.[preference] !== false);
  const verified = wanted.length ? await verifiedUserIds(service, wanted) : new Set<string>();
  if (!verified) return { ids: [], preferences };
  return { ids: wanted.filter((id) => verified.has(id)), preferences };
}

async function deliver<T>(
  context: JobContext,
  items: readonly T[],
  send: (item: T) => Promise<JobOutcome>,
): Promise<JobReport> {
  const report = emptyReport();
  report.candidates = items.length;
  await runWithBudget(
    items,
    async (item) => {
      const outcome = await send(item);
      report.outcomes[outcome] = (report.outcomes[outcome] ?? 0) + 1;
      if (outcome === "sent") report.sent += 1;
      return outcome === "sent";
    },
    { concurrency: MAIL_CONCURRENCY, deadline: context.deadline },
  );
  return report;
}

type MasteryRow = Record<string, unknown> & { exam_prep_id?: string };

/** Öğrencinin konu hâkimiyeti (rozet ve yüzde, ekranlarla aynı hesap). */
async function masteryFor(
  service: SupabaseClient,
  filter: { userId: string; prepId?: string },
): Promise<{ label: string; badge: string; percent: number | null; measured: boolean; lastPracticedAt: string | null }[]> {
  let query = service.from("exam_prep_topic_mastery").select(`${MASTERY_ROW_COLUMNS}, exam_prep_id`).eq("user_id", filter.userId);
  if (filter.prepId) query = query.eq("exam_prep_id", filter.prepId);
  const { data, error } = await query.limit(500);
  if (error) return [];
  return ((data ?? []) as MasteryRow[]).map((row) => {
    const snapshot = scoreTopicMastery(masterySnapshotFromRow(row));
    const view = topicMasteryView(snapshot, null);
    return {
      label: withoutOutcomeCode(String(row.topic_key ?? "")),
      badge: view.badge,
      percent: view.state === "unmeasured" ? null : view.percent,
      measured: view.state !== "unmeasured",
      lastPracticedAt: snapshot.lastPracticedAt,
    };
  });
}

/* ───────────── 7 · Plan bitişi (18:30, 3 gün ve 24 saat kala) ───────────── */

export async function runExpiryReminders(context: JobContext): Promise<JobReport> {
  const { service, now } = context;
  const today = istanbulClock(now).day;
  const horizon = new Date(now.getTime() + 4 * 86_400_000).toISOString();
  const { data, error } = await service
    .from("subscriptions")
    .select("id, user_id, current_period_start, current_period_end, cancel_at_period_end, trial_until, plans(name)")
    .eq("status", "active")
    .gt("current_period_end", now.toISOString())
    .lte("current_period_end", horizon)
    .limit(PAGE);
  if (error) return emptyReport();
  type Sub = {
    id: string;
    user_id: string;
    current_period_start: string | null;
    current_period_end: string;
    cancel_at_period_end: boolean | null;
    trial_until: string | null;
    plans: { name: string | null } | null;
  };
  const windows = ((data ?? []) as unknown as Sub[])
    // Deneme (kodla açılan Plus) kendi e-postasını alır ("ücretsize dönersin"); "yenilemeyeceğim" diyen hatırlatılmaz.
    .filter((sub) => !isTrialPeriod(sub) && sub.cancel_at_period_end !== true)
    .map((sub) => {
      const left = daysBetween(today, istanbulClock(new Date(sub.current_period_end)).day);
      const window = left === 3 ? ("3d" as const) : left === 1 ? ("24h" as const) : null;
      return window ? { sub, window } : null;
    })
    .filter((item): item is { sub: Sub; window: "3d" | "24h" } => item !== null);
  const { ids } = await eligible(service, windows.map((item) => item.sub.user_id), "studyRemindersEmail");
  const allowed = new Set(ids);
  return deliver(
    context,
    windows.filter((item) => allowed.has(item.sub.user_id)),
    async ({ sub, window }) => {
      const since = sub.current_period_start ?? new Date(now.getTime() - 30 * 86_400_000).toISOString();
      const [{ count: completedSteps }, mastery] = await Promise.all([
        service
          .from("exam_prep_node_attempts")
          .select("id", { count: "exact", head: true })
          .eq("user_id", sub.user_id)
          .eq("status", "completed")
          .gte("created_at", since),
        masteryFor(service, { userId: sub.user_id }),
      ]);
      return sendGuardedMail(service, {
        userId: sub.user_id,
        templateKey: "subscription_expiry_reminder",
        dedupeKey: dedupeKeys.expiry(sub.id, window),
        category: "lifecycle",
        unsubscribe: "studyRemindersEmail",
        now,
        render: ({ origin, preferencesUrl, firstName }) =>
          renderSubscriptionExpiryReminder({
            firstName,
            planName: sub.plans?.name?.trim() || "Plus",
            window,
            periodEnd: sub.current_period_end,
            learnedTopics: mastery.filter((topic) => topic.badge === "learned").length,
            completedSteps: completedSteps ?? 0,
            origin,
            preferencesUrl: preferencesUrl ?? `${origin}/ayarlar`,
          }),
      });
    },
  );
}

/* ───────────── 6 · Sınav arifesi (18:30, 48 ve 24 saat kala) ───────────── */

export async function runExamEve(context: JobContext): Promise<JobReport> {
  const { service, now } = context;
  const today = istanbulClock(now).day;
  const dayAfter = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await service
    .from("exam_preps")
    .select("id, user_id, title, exam_date, exam_type")
    .in("exam_date", [dayAfter(1), dayAfter(2)])
    .neq("exam_type", "hedef")
    .neq("exam_type", STUDIO_EXAM_TYPE)
    .limit(PAGE);
  if (error) return emptyReport();
  type Prep = { id: string; user_id: string; title: string | null; exam_date: string };
  const preps = (data ?? []) as Prep[];
  const { ids } = await eligible(service, preps.map((prep) => prep.user_id), "examCountdownEmail");
  const allowed = new Set(ids);
  return deliver(
    context,
    preps.filter((prep) => allowed.has(prep.user_id)),
    async (prep) => {
      const hoursLeft = daysBetween(today, prep.exam_date) === 1 ? (24 as const) : (48 as const);
      const [mastery, { count: totalTopics }, locked] = await Promise.all([
        masteryFor(service, { userId: prep.user_id, prepId: prep.id }),
        service.from("exam_prep_topics").select("id", { count: "exact", head: true }).eq("exam_prep_id", prep.id),
        plusOnlyLocked(service, prep.user_id).catch(() => true),
      ]);
      const weakest = mastery
        .filter((topic) => topic.measured && topic.badge !== "learned" && topic.label)
        .sort((a, b) => (a.percent ?? 0) - (b.percent ?? 0))
        .slice(0, 3)
        .map((topic) => topic.label);
      return sendGuardedMail(service, {
        userId: prep.user_id,
        templateKey: "exam_eve_cheat_sheet",
        dedupeKey: dedupeKeys.examEve(prep.id, hoursLeft),
        category: "lifecycle",
        unsubscribe: "examCountdownEmail",
        now,
        render: ({ origin, preferencesUrl, firstName }) =>
          renderExamEveCheatSheet({
            firstName,
            prepTitle: prep.title?.trim() || "Sınav hazırlığın",
            hoursLeft,
            learnedTopics: mastery.filter((topic) => topic.badge === "learned").length,
            totalTopics: Math.max(totalTopics ?? 0, mastery.length),
            weakestTopics: weakest,
            // Sınav sabahı kâğıdı Plus'ta: ücretsiz hesaba vaat edilmez, tekrar bağlantısı gider.
            cramSheetAvailable: !locked,
            prepId: prep.id,
            origin,
            preferencesUrl: preferencesUrl ?? `${origin}/ayarlar`,
          }),
      });
    },
  );
}

/* ───────────── 5 · Açık sınav tuzağı (öğrencinin saati; 72 saat ara; haftada bir) ───────────── */

export const SMART_TRAP_IDLE_HOURS = 72;

export async function runSmartTrap(context: JobContext, studyHour: number): Promise<JobReport> {
  const { service, now } = context;
  const { data, error } = await service
    .from("exam_prep_misconceptions")
    .select("user_id, exam_prep_id, topic_label")
    .is("resolved_at", null)
    .limit(5000);
  if (error) return emptyReport();
  type Miss = { user_id: string; exam_prep_id: string; topic_label: string | null };
  const groups = new Map<string, { userId: string; prepId: string; topic: string; count: number }>();
  for (const row of (data ?? []) as Miss[]) {
    if (!row.user_id || !row.exam_prep_id) continue;
    const topic = withoutOutcomeCode(String(row.topic_label ?? "").trim()) || "Karışık konular";
    const key = `${row.user_id}|${row.exam_prep_id}|${topic}`;
    const entry = groups.get(key) ?? { userId: row.user_id, prepId: row.exam_prep_id, topic, count: 0 };
    entry.count += 1;
    groups.set(key, entry);
  }
  // Öğrenci başına en kalabalık konu.
  const perUser = new Map<string, { userId: string; prepId: string; topic: string; count: number }>();
  for (const entry of groups.values()) {
    const current = perUser.get(entry.userId);
    if (!current || entry.count > current.count) perUser.set(entry.userId, entry);
  }
  const userIds = [...perUser.keys()];
  if (!userIds.length) return emptyReport();
  const lastActivity = await lastActivityByUser(service, userIds);
  const idle = userIds.filter((userId) => {
    const last = lastActivity.get(userId);
    return !last || now.getTime() - Date.parse(last) >= SMART_TRAP_IDLE_HOURS * 3_600_000;
  });
  const { ids, preferences } = await eligible(service, idle, "studyRemindersEmail");
  const inSlot = ids.filter((userId) => preferences.get(userId)?.preferredStudyHour === studyHour);
  const prepIds = [...new Set(inSlot.map((userId) => perUser.get(userId)!.prepId))];
  const { data: prepRows } = prepIds.length
    ? await service.from("exam_preps").select("id, title").in("id", prepIds)
    : { data: [] as { id: string; title: string | null }[] };
  const titles = new Map(((prepRows ?? []) as { id: string; title: string | null }[]).map((row) => [row.id, row.title]));
  const week = isoWeekOf(now);
  return deliver(
    context,
    inSlot.map((userId) => perUser.get(userId)!).filter((entry) => titles.has(entry.prepId)),
    (entry) =>
      sendGuardedMail(service, {
        userId: entry.userId,
        templateKey: "smart_trap_nudge",
        dedupeKey: dedupeKeys.smartTrap(entry.userId, week),
        category: "lifecycle",
        unsubscribe: "studyRemindersEmail",
        now,
        render: ({ origin, preferencesUrl, firstName }) =>
          renderSmartTrapNudge({
            firstName,
            prepTitle: titles.get(entry.prepId)?.trim() || "Sınav hazırlığın",
            topicTitle: entry.topic,
            mistakeCount: entry.count,
            prepId: entry.prepId,
            origin,
            preferencesUrl: preferencesUrl ?? `${origin}/ayarlar`,
          }),
      }),
  );
}

/* ───────────── 3 · Etkinleştirme (kayıttan 24 saat sonra, 19:00; bir kez) ───────────── */

export async function runActivation(context: JobContext): Promise<JobReport> {
  const { service, now } = context;
  const from = new Date(now.getTime() - 48 * 3_600_000).toISOString();
  const to = new Date(now.getTime() - 24 * 3_600_000).toISOString();
  const { data, error } = await service.from("profiles").select("id").gte("created_at", from).lt("created_at", to).limit(PAGE);
  if (error) return emptyReport();
  const fresh = ((data ?? []) as { id: string }[]).map((row) => row.id);
  if (!fresh.length) return emptyReport();
  const { data: preps } = await service
    .from("exam_preps")
    .select("user_id")
    .in("user_id", fresh)
    .neq("exam_type", "hedef")
    .neq("exam_type", STUDIO_EXAM_TYPE);
  const started = new Set(((preps ?? []) as { user_id: string }[]).map((row) => row.user_id));
  const { ids } = await eligible(service, fresh.filter((id) => !started.has(id)), "studyRemindersEmail");
  return deliver(context, ids, (userId) =>
    sendGuardedMail(service, {
      userId,
      templateKey: "activation_24h",
      dedupeKey: dedupeKeys.activation(userId),
      category: "lifecycle",
      unsubscribe: "studyRemindersEmail",
      now,
      render: ({ origin, preferencesUrl, firstName }) =>
        renderActivation24h({ firstName, origin, preferencesUrl: preferencesUrl ?? `${origin}/ayarlar` }),
    }),
  );
}

/* ───────────── 4 · 1. konu bitti (19:30; bir kez; YALNIZ kampanya izni + kampanya anahtarı açık) ───────────── */

export async function runFreeFirstUnit(context: JobContext): Promise<JobReport> {
  const { service, now } = context;
  // Satış içerir: ticari elektronik ileti. İYS kaydı ve kampanya anahtarı açılmadan gönderilmez (ürün sahibinin kararı).
  if (!(await isFeatureEnabled(service, MARKETING_EMAIL_FLAG).catch(() => false))) return emptyReport();
  const { data, error } = await service.from("email_preferences").select("user_id").eq("marketing", true).limit(PAGE);
  if (error) return emptyReport();
  const consented = ((data ?? []) as { user_id: string }[]).map((row) => row.user_id);
  if (!consented.length) return emptyReport();
  const { data: paid } = await service
    .from("subscriptions")
    .select("user_id")
    .in("user_id", consented)
    .eq("status", "active");
  const paying = new Set(((paid ?? []) as { user_id: string }[]).map((row) => row.user_id));
  const free = consented.filter((id) => !paying.has(id));
  const lastActivity = await lastActivityByUser(service, free);
  // 1. konu bittikten sonra 24 saat yeni etkinlik açmamış öğrenci (bitirir bitirmez satış e-postası gitmesin).
  const rested = free.filter((id) => {
    const last = lastActivity.get(id);
    return Boolean(last) && now.getTime() - Date.parse(last!) >= 24 * 3_600_000;
  });
  const verified = rested.length ? await verifiedUserIds(service, rested) : new Set<string>();
  if (!verified) return emptyReport();
  return deliver(context, rested.filter((id) => verified.has(id)), async (userId) => {
    const status = await firstLessonStatus(service, userId);
    if (!status || status.state !== "done" || !status.prepId) return "not_due";
    const prepId = status.prepId;
    const [mastery, { count: topicCount }, { data: prep }] = await Promise.all([
      masteryFor(service, { userId, prepId }),
      service.from("exam_prep_topics").select("id", { count: "exact", head: true }).eq("exam_prep_id", prepId),
      service.from("exam_preps").select("title").eq("id", prepId).maybeSingle(),
    ]);
    const first = status.title ? mastery.find((topic) => topic.label === withoutOutcomeCode(status.title!)) : null;
    return sendGuardedMail(service, {
      userId,
      templateKey: "free_first_unit_completed",
      dedupeKey: dedupeKeys.freeFirstUnit(userId),
      category: "lifecycle",
      unsubscribe: "marketing",
      now,
      render: ({ origin, preferencesUrl, firstName }) =>
        renderFreeFirstUnitCompleted({
          firstName,
          prepTitle: (prep?.title as string | undefined)?.trim() || "Sınav hazırlığın",
          masteryPct: Math.max(0, Math.min(100, Math.round(first?.percent ?? 0))),
          remainingUnits: Math.max(0, (topicCount ?? 1) - 1),
          origin,
          preferencesUrl: preferencesUrl ?? `${origin}/ayarlar`,
        }),
    });
  });
}

/* ───────────── 8 · Haftalık karne (Pazar 19:00) ───────────── */

export async function runWeeklyDigest(context: JobContext): Promise<JobReport> {
  const { service, now } = context;
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const { data, error } = await service
    .from("exam_prep_node_attempts")
    .select("user_id")
    .eq("status", "completed")
    .gte("created_at", weekAgo)
    .limit(5000);
  if (error) return emptyReport();
  const counts = new Map<string, number>();
  for (const row of (data ?? []) as { user_id: string }[]) counts.set(row.user_id, (counts.get(row.user_id) ?? 0) + 1);
  const { ids } = await eligible(service, [...counts.keys()], "weeklyDigestEmail");
  const week = isoWeekOf(now);
  return deliver(context, ids, async (userId) => {
    const [mastery, { data: streak }, skip] = await Promise.all([
      masteryFor(service, { userId }),
      service.from("user_streaks").select("current_streak").eq("user_id", userId).maybeSingle(),
      pathSkipKinds(service, userId).catch(() => new Set<string>()),
    ]);
    const next = await loadContinueStep(service, userId, skip).catch(() => null);
    const weeklyLearned = mastery.filter(
      (topic) => topic.badge === "learned" && topic.lastPracticedAt && Date.parse(topic.lastPracticedAt) >= Date.parse(weekAgo),
    ).length;
    return sendGuardedMail(service, {
      userId,
      templateKey: "weekly_study_digest",
      dedupeKey: dedupeKeys.weekly(userId, week),
      category: "lifecycle",
      unsubscribe: "weeklyDigestEmail",
      now,
      render: ({ origin, preferencesUrl, firstName }) =>
        renderWeeklyStudyDigest({
          firstName,
          weeklyLearned,
          completedActivities: counts.get(userId) ?? 0,
          streakDays: Number((streak as { current_streak?: number } | null)?.current_streak ?? 0),
          nextStep: next?.next
            ? { title: next.next.heading, href: next.next.href.startsWith("http") ? next.next.href : `${origin}${next.next.href}` }
            : null,
          origin,
          preferencesUrl: preferencesUrl ?? `${origin}/ayarlar`,
        }),
    });
  });
}
