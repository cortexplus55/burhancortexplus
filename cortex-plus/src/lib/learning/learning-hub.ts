import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { onboardingPathForRole } from "@/lib/auth/onboarding-path";
import { continueHref, mapPrepTopics } from "@/lib/learning/exam-prep-progress";
import { resolveExamCountdown, type ExamCountdown } from "@/lib/learning/exam-countdown";
import {
  resolveNextBestAction,
  type NextBestAction,
} from "@/lib/learning/next-best-action";
import {
  readinessFromComposite,
  readinessFromExamPrep,
  type StudentReadiness,
} from "@/lib/learning/student-readiness";
import {
  rankWeakTopics,
  recentMissRateByTopic,
  type RankedWeakTopic,
} from "@/lib/learning/weak-topic-rank";
import {
  buildTodaysStudyPlan,
  rescheduleOverdueTasks,
  type TodaysPlanTask,
} from "@/lib/learning/todays-plan";
import { countMistakes } from "@/lib/learning/mistake-notebook";
import { getUserStreak } from "@/lib/streak/record-activity";
import { createServiceClient } from "@/lib/supabase/server";
import { maybeRescheduleMissedDays } from "@/lib/learning/missed-day-reschedule";
import type { TopicMasterySnapshot } from "@/lib/learning/learning-tracking";
import type { ProgressSummary } from "@/lib/learning/progress-line";
import { STALE_PROCESSING_MS } from "@/lib/documents/processing-stale";

export type LearningHubSnapshot = {
  firstName: string;
  countdown: ExamCountdown;
  readiness: StudentReadiness;
  nextBestAction: NextBestAction;
  todaysTasks: TodaysPlanTask[];
  totalMinutes: number;
  weakTopics: RankedWeakTopic[];
  streak: number;
  recentDocuments: { id: string; fileName: string; status: string }[];
  secondary: { href: string; label: string }[];
  /** "Son ilerleme" satırı — tek cümle, ayrı katalog değil. */
  progress: ProgressSummary;
};

function istanbulToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function masteryFromRows(
  rows: {
    topic_key: string;
    measured_level?: string | null;
    evidence_count?: number | null;
    first_attempt_correct?: number | null;
    first_attempt_total?: number | null;
    independent_correct?: number | null;
    independent_total?: number | null;
    last_practiced_at?: string | null;
    confidence?: number | null;
  }[],
): TopicMasterySnapshot[] {
  return rows.map((row) => {
    const levelRaw = row.measured_level ?? "unmeasured";
    const level =
      levelRaw === "weak" ||
      levelRaw === "emerging" ||
      levelRaw === "solid"
        ? levelRaw
        : "unmeasured";
    const evidenceCount = Number(row.evidence_count ?? 0);
    return {
      topicKey: row.topic_key,
      measured: level !== "unmeasured" && evidenceCount > 0,
      level,
      confidence: Number(row.confidence ?? 0),
      evidenceCount,
      firstAttemptCorrect: Number(row.first_attempt_correct ?? 0),
      firstAttemptTotal: Number(row.first_attempt_total ?? 0),
      independentCorrect: Number(row.independent_correct ?? 0),
      independentTotal: Number(row.independent_total ?? 0),
      lastPracticedAt: row.last_practiced_at ?? null,
    };
  });
}

/**
 * Dashboard için tüm closed-loop sinyallerini tek seferde yükler.
 */
export async function loadLearningHub(
  supabase: SupabaseClient,
  userId: string,
  email?: string | null,
): Promise<LearningHubSnapshot> {
  const today = istanbulToday();
  const now = new Date();

  // Adaptive: missed calendar days → rebuild schedule (best-effort).
  try {
    await maybeRescheduleMissedDays(createServiceClient(), userId);
  } catch {
    // ignore
  }

  const [
    { data: profile },
    { data: goal },
    { data: preps },
    { data: processingDocs },
    { count: completedDocCount },
    { data: recentDocs },
    mistakes,
    streak,
    { data: openTasks },
    { data: weakRows },
    { data: mistakeRows },
    { data: activeAttempt },
    { data: lastExamAttempt },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, onboarding_completed_at, primary_role")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("learning_goals")
      .select("goal_text, target_date")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("exam_preps")
      .select("id, title, exam_date, exam_type, learning_tracking, daily_minutes")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("documents")
      .select("id, file_name, updated_at")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .in("status", ["pending", "processing"])
      // Takılı kalan belge ana aksiyonu sonsuza dek kilitlemesin: işleme
      // yarım saatten uzun süredir kımıldamıyorsa NBA onu görmez; öğrenci
      // belge sayfasında "Yeniden işle"yi görür.
      .gte("updated_at", new Date(now.getTime() - STALE_PROCESSING_MS).toISOString())
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("deleted_at", null)
      .eq("status", "completed"),
    supabase
      .from("documents")
      .select("id, file_name, status")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(4),
    countMistakes(supabase, userId),
    getUserStreak(supabase, userId),
    supabase
      .from("study_plan_tasks")
      .select("id, title, due_date, completed, study_plans!inner(user_id)")
      .eq("study_plans.user_id", userId)
      .eq("completed", false)
      .order("due_date")
      .limit(20),
    supabase
      .from("weak_topics")
      .select("topic_label, severity, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(60),
    supabase
      .from("mistake_entries")
      .select(
        "topic_label, wrong_count, correct_streak, last_reviewed_at, mastered_at",
      )
      .eq("user_id", userId)
      .is("mastered_at", null)
      .limit(100),
    supabase
      .from("exam_prep_node_attempts")
      .select("id, exam_prep_id, node_id, status")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("practice_exam_attempts")
      .select("score, completed_at")
      .eq("user_id", userId)
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // Persist overdue → today for study_plan_tasks.
  const taskRows = (openTasks ?? []).map((t) => ({
    id: t.id as string,
    title: t.title as string,
    due_date: (t.due_date as string | null) ?? null,
    completed: Boolean(t.completed),
  }));
  const { tasks: rescheduled, movedIds } = rescheduleOverdueTasks(taskRows, today);
  if (movedIds.length) {
    await supabase
      .from("study_plan_tasks")
      .update({ due_date: today })
      .in("id", movedIds);
  }
  const todaysPlanRows = rescheduled.filter(
    (t) => !t.completed && t.due_date && t.due_date <= today,
  );

  const nearestPrep = (preps ?? [])
    .filter((p) => p.exam_date)
    .map((p) => ({
      ...p,
      days: resolveExamCountdown({
        prepExamDate: p.exam_date as string,
        prepTitle: (p.title as string) ?? (p.exam_type as string) ?? "Sınav",
      }),
    }))
    .filter((p) => p.days.state === "countdown" || p.days.state === "past")
    .sort((a, b) => {
      const da = a.days.daysLeft ?? 9999;
      const db = b.days.daysLeft ?? 9999;
      // Prefer future, then soonest.
      if (da < 0 && db >= 0) return 1;
      if (db < 0 && da >= 0) return -1;
      return Math.abs(da) - Math.abs(db);
    })[0];

  const countdown = resolveExamCountdown({
    prepExamDate: (nearestPrep?.exam_date as string | null) ?? null,
    prepTitle:
      (nearestPrep?.title as string | null) ??
      (nearestPrep?.exam_type as string | null) ??
      null,
    goalTargetDate: (goal?.target_date as string | null) ?? null,
  });

  // Son 30 günün quiz/deneme yanlış oranı konu bazında — sıralama tek bir
  // "kaç kez yanlış" sayısına değil, yakın dönem performansına da baksın.
  const missRates = recentMissRateByTopic(
    (weakRows ?? []).map((w) => ({
      topic_label: (w.topic_label as string | null) ?? null,
      severity: w.severity == null ? null : Number(w.severity),
      created_at: (w.created_at as string | null) ?? null,
    })),
  );
  const missRateFor = (label: string) => missRates.get(label) ?? null;
  const missValues = [...missRates.values()];
  const recentAccuracyPct =
    missValues.length > 0
      ? Math.round(
          (1 - missValues.reduce((a, b) => a + b, 0) / missValues.length) * 100,
        )
      : null;

  let readiness: StudentReadiness;
  let examPrepContinueHref: string | null = null;
  let examPrepContinueLabel: string | null = null;
  let prepNodeForToday: { id: string; title: string; href: string } | null =
    null;

  const primaryPrepId =
    (nearestPrep?.id as string | undefined) ??
    ((preps ?? [])[0]?.id as string | undefined);

  if (primaryPrepId) {
    const [{ data: topics }, { data: masteryRows }, { data: nodes }] =
      await Promise.all([
        supabase
          .from("exam_prep_topics")
          .select("id, label, sort_order, status, lesson_id")
          .eq("exam_prep_id", primaryPrepId)
          .order("sort_order"),
        supabase
          .from("exam_prep_topic_mastery")
          .select(
            "topic_key, measured_level, evidence_count, first_attempt_correct, first_attempt_total, independent_correct, independent_total, last_practiced_at, confidence",
          )
          .eq("exam_prep_id", primaryPrepId),
        supabase
          .from("exam_prep_nodes")
          .select("id, title, status, sort_order, kind")
          .eq("exam_prep_id", primaryPrepId)
          .order("sort_order")
          .limit(40),
      ]);

    const mapped = mapPrepTopics(topics ?? []);
    examPrepContinueHref = continueHref(primaryPrepId, mapped);
    examPrepContinueLabel = "Çalışmaya devam et";

    const tracking = nearestPrep?.learning_tracking as
      | { programProgressPct?: number; examReadinessPct?: number }
      | null;
    const programPct = Number(tracking?.programProgressPct ?? 0);
    const snapshots = masteryFromRows(masteryRows ?? []);

    readiness = readinessFromExamPrep({
      programPct,
      topics: snapshots,
      plannedTopicKeys: snapshots.map((s) => s.topicKey),
      openMistakes: mistakes.open,
    });

    const readyNode = (nodes ?? []).find(
      (n) => n.status === "ready" || n.status === "in_progress",
    );
    if (readyNode) {
      prepNodeForToday = {
        id: readyNode.id as string,
        title: (readyNode.title as string) || "Sıradaki çalışma",
        href: `/deneme-sinavlari/${primaryPrepId}/dugum/${readyNode.id}`,
      };
      examPrepContinueHref = prepNodeForToday.href;
    }
  } else {
    readiness = readinessFromComposite({
      openMistakes: mistakes.open,
      masteredMistakes: mistakes.mastered,
      weakTopics: (weakRows ?? []).map((w) => ({
        severity: Number(w.severity ?? 0.5),
      })),
      recentQuizAccuracy: recentAccuracyPct,
    });
  }

  const weakTopics = rankWeakTopics([
    ...(mistakeRows ?? []).map((m) => {
      const topicLabel = (m.topic_label as string) || "Konusu belirsiz";
      return {
        topicLabel,
        wrongCount: Number(m.wrong_count ?? 1),
        correctStreak: Number(m.correct_streak ?? 0),
        lastReviewedAt: (m.last_reviewed_at as string | null) ?? null,
        severity: null as number | null,
        recentMissRate: missRateFor(topicLabel),
      };
    }),
    ...(weakRows ?? []).map((w) => {
      const topicLabel = (w.topic_label as string) || "Konusu belirsiz";
      return {
        topicLabel,
        wrongCount: 1,
        correctStreak: 0,
        lastReviewedAt: null,
        severity: Number(w.severity ?? 0.5),
        recentMissRate: missRateFor(topicLabel),
      };
    }),
  ]);

  const dailyMinutesCap =
    typeof nearestPrep?.daily_minutes === "number" && nearestPrep.daily_minutes > 0
      ? (nearestPrep.daily_minutes as number)
      : null;

  const { tasks: todaysTasks, totalMinutes } = buildTodaysStudyPlan({
    dailyMinutesCap,
    studyPlanTasks: todaysPlanRows.slice(0, 2).map((t) => ({
      id: t.id,
      title: t.title,
      href: "/calisma-plani",
    })),
    openMistakes: mistakes.open,
    weakTopicLabels: weakTopics.map((w) => w.topicLabel),
    prepNode: prepNodeForToday,
    includeOral: mistakes.open === 0,
  });

  let resumeHref: string | null = null;
  if (activeAttempt?.node_id && activeAttempt.exam_prep_id) {
    resumeHref = `/deneme-sinavlari/${activeAttempt.exam_prep_id}/dugum/${activeAttempt.node_id}`;
  }

  const onboardingComplete = Boolean(profile?.onboarding_completed_at);
  const processing = processingDocs?.[0] ?? null;
  const firstTask = todaysTasks[0] ?? null;

  const nba = resolveNextBestAction({
    onboardingComplete,
    processingDocumentId: processing ? (processing.id as string) : null,
    processingDocumentName: processing
      ? (processing.file_name as string)
      : null,
    resumeHref,
    resumeLabel: resumeHref ? "Yarım kalan çalışmaya dön" : null,
    studyTaskHref: firstTask && !resumeHref ? firstTask.href : null,
    studyTaskTitle: firstTask?.title ?? null,
    openMistakeCount: mistakes.open,
    examPrepContinueHref,
    examPrepContinueLabel,
    hasCompletedDocument: (completedDocCount ?? 0) > 0,
    examDateMissing: countdown.state === "missing" || countdown.state === "past",
  });

  let nextBestAction = !onboardingComplete
    ? {
        ...nba,
        href: onboardingPathForRole(
          profile?.primary_role as string | undefined,
        ),
      }
    : nba;

  let tasksOut = todaysTasks;
  let minutesOut = totalMinutes;

  // Adaptive Learning Engine overlay (flag OFF = no change).
  try {
    const service = createServiceClient();
    const { isFeatureEnabled, ADAPTIVE_LEARNING_FLAG } = await import(
      "@/lib/admin/feature-flags"
    );
    if (
      onboardingComplete &&
      nearestPrep?.id &&
      (await isFeatureEnabled(service, ADAPTIVE_LEARNING_FLAG, userId))
    ) {
      const { ensureCurrentDailyPlan } = await import(
        "@/lib/adaptive/daily-planner"
      );
      const plan = await ensureCurrentDailyPlan(service, {
        userId,
        examPrepId: nearestPrep.id as string,
      });
      if (plan.items.length) {
        tasksOut = plan.items.map((item) => ({
          id: item.id,
          title: item.title,
          minutes: item.minutes,
          href: item.href ?? `/deneme-sinavlari/${nearestPrep.id}/oturum`,
          kind: "prep_node" as const,
        }));
        minutesOut = plan.estimatedMinutes || minutesOut;
      }
      if (!resumeHref && !processing) {
        nextBestAction = {
          kind: "exam_prep_node",
          href: `/deneme-sinavlari/${nearestPrep.id}/oturum`,
          label: "Çalışmaya Başla",
          reason:
            plan.rebalanceNotice ||
            plan.objective ||
            "Bugünkü programın hazır",
        };
      }
    }
  } catch {
    // Adaptive overlay must never break the hub.
  }

  const firstName =
    ((profile?.full_name as string | null) ?? "").split(" ")[0] ||
    (email ?? "").split("@")[0] ||
    "";

  return {
    firstName,
    countdown,
    readiness,
    nextBestAction,
    todaysTasks: tasksOut,
    totalMinutes: minutesOut,
    weakTopics,
    streak,
    recentDocuments: (recentDocs ?? []).map((d) => ({
      id: d.id as string,
      fileName: d.file_name as string,
      status: d.status as string,
    })),
    secondary: [
      { href: "/dashboard", label: "Bugün" },
      { href: "/ogretmen", label: "Sohbet" },
      { href: "/dokumanlar", label: "Kaynaklarım" },
      { href: "/deneme-sinavlari", label: "Programı Gör" },
      { href: "/ilerleme", label: "İlerlemem" },
      { href: "/yanlislarim", label: "Yanlışlar" },
    ],
    progress: {
      onTargetTopics: readiness.onTargetTopics,
      totalTopics: readiness.totalTopics,
      masteredMistakes: mistakes.mastered,
      openMistakes: mistakes.open,
      lastExamScore:
        lastExamAttempt?.score == null ? null : Math.round(Number(lastExamAttempt.score)),
      lastExamAt: (lastExamAttempt?.completed_at as string | null) ?? null,
    },
  };
}
