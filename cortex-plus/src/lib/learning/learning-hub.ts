import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { onboardingPathForRole } from "@/lib/auth/onboarding-path";
import { continueHref, mapPrepTopics } from "@/lib/learning/exam-prep-progress";
import {
  daysUntilDate,
  resolveExamCountdown,
  type ExamCountdown,
} from "@/lib/learning/exam-countdown";
import {
  FOCUS_PREP_COOKIE,
  selectFocusPrep,
  type FocusPrepCandidate,
} from "@/lib/learning/focus-prep";
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
import { failStaleProcessingDocuments } from "@/lib/documents/fail-stale-processing";
import {
  pickScopedProcessingDocument,
  processingBlocksNextAction,
  scopedDocumentIdsForPrep,
} from "@/lib/learning/learning-hub-processing-gate";

/**
 * Adaptive pilot: a stale legacy `resumeHref` (an old, unrelated
 * exam_prep_node_attempts row left "active") must never block the pilot's
 * primary CTA from routing into the adaptive session — that CTA *is* the
 * pilot. Production showed adaptive_daily_plans populated (the overlay ran)
 * but adaptive_learning_sessions stayed at 0: the CTA never re-pointed to
 * `/oturum` because the pilot account had a leftover active legacy attempt
 * from earlier testing. A document still processing is a real reason to
 * wait — you cannot start a session against a source that is not ready —
 * so that gate stays.
 */
export function shouldRouteToAdaptiveSession(input: {
  resumeHref: string | null;
  processing: boolean;
}): boolean {
  return !input.processing;
}

export type LearningHubSwitchPrep = {
  id: string;
  title: string;
  daysLeft: number | null;
};

export type LearningHubUrgentChip = {
  prepId: string;
  title: string;
  daysLeft: number;
};

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
  failedDocuments: { id: string; fileName: string }[];
  secondary: { href: string; label: string }[];
  /** "Son ilerleme" satırı — tek cümle, ayrı katalog değil. */
  progress: ProgressSummary;
  /** Dashboard / Çalış odak sınavı (selectFocusPrep). */
  focusPrepId: string | null;
  urgentChip: LearningHubUrgentChip | null;
  switchPreps: LearningHubSwitchPrep[];
};

function maxIsoByPrep(
  rows: { exam_prep_id: string; ts: string | null | undefined }[],
): Map<string, string> {
  const best = new Map<string, number>();
  for (const row of rows) {
    if (!row.ts) continue;
    const parsed = Date.parse(row.ts);
    if (!Number.isFinite(parsed)) continue;
    const id = row.exam_prep_id;
    const prev = best.get(id) ?? 0;
    if (parsed > prev) best.set(id, parsed);
  }
  const out = new Map<string, string>();
  for (const [id, ts] of best) {
    out.set(id, new Date(ts).toISOString());
  }
  return out;
}

function unfinishedByPrep(
  topicRows: { exam_prep_id: string; status: string | null }[],
): Map<string, boolean> {
  const totals = new Map<string, { done: number; total: number }>();
  for (const row of topicRows) {
    const id = row.exam_prep_id;
    const cur = totals.get(id) ?? { done: 0, total: 0 };
    cur.total += 1;
    if (row.status === "done") cur.done += 1;
    totals.set(id, cur);
  }
  const out = new Map<string, boolean>();
  for (const [id, { done, total }] of totals) {
    out.set(id, total > 0 && done < total);
  }
  return out;
}

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
  options?: { cookiePrepId?: string | null },
): Promise<LearningHubSnapshot> {
  const today = istanbulToday();
  const now = new Date();
  const service = createServiceClient();

  // Adaptive: missed calendar days → rebuild schedule (best-effort).
  try {
    await maybeRescheduleMissedDays(service, userId);
  } catch {
    // ignore
  }

  try {
    await failStaleProcessingDocuments(service, userId, now);
  } catch {
    // Hub must render even if stale cleanup fails.
  }

  const failedSince = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: profile },
    { data: goal },
    { data: preps },
    { data: processingDocs },
    { data: failedDocs },
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
      .select(
        "id, title, exam_date, exam_type, learning_tracking, daily_minutes, document_id, source_document_ids, created_at",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("documents")
      .select("id, file_name, updated_at, topic_map_status")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .in("status", ["pending", "processing"])
      .order("updated_at", { ascending: false })
      .limit(12),
    supabase
      .from("documents")
      .select("id, file_name, updated_at")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .eq("status", "failed")
      .gte("updated_at", failedSince)
      .order("updated_at", { ascending: false })
      .limit(6),
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

  const prepList = preps ?? [];
  const prepIds = prepList.map((p) => p.id as string);

  const cookieStore = await cookies();
  const cookiePrepId =
    options?.cookiePrepId ??
    cookieStore.get(FOCUS_PREP_COOKIE)?.value ??
    null;

  const [{ data: attemptActivity }, { data: masteryActivity }, { data: topicStatusRows }] =
    prepIds.length
      ? await Promise.all([
          supabase
            .from("exam_prep_node_attempts")
            .select("exam_prep_id, updated_at")
            .eq("user_id", userId)
            .in("exam_prep_id", prepIds),
          supabase
            .from("exam_prep_topic_mastery")
            .select("exam_prep_id, last_practiced_at")
            .eq("user_id", userId)
            .in("exam_prep_id", prepIds),
          supabase
            .from("exam_prep_topics")
            .select("exam_prep_id, status")
            .in("exam_prep_id", prepIds),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }];

  const attemptMax = maxIsoByPrep(
    (attemptActivity ?? []).map((r) => ({
      exam_prep_id: r.exam_prep_id as string,
      ts: r.updated_at as string,
    })),
  );
  const masteryMax = maxIsoByPrep(
    (masteryActivity ?? []).map((r) => ({
      exam_prep_id: r.exam_prep_id as string,
      ts: r.last_practiced_at as string | null,
    })),
  );
  const unfinishedMap = unfinishedByPrep(
    (topicStatusRows ?? []).map((r) => ({
      exam_prep_id: r.exam_prep_id as string,
      status: r.status as string | null,
    })),
  );

  const focusCandidates: FocusPrepCandidate[] = prepList.map((p) => {
    const id = p.id as string;
    const attemptAt = attemptMax.get(id) ?? null;
    const masteryAt = masteryMax.get(id) ?? null;
    let lastActivityAt: string | null = null;
    if (attemptAt && masteryAt) {
      lastActivityAt =
        Date.parse(attemptAt) >= Date.parse(masteryAt) ? attemptAt : masteryAt;
    } else {
      lastActivityAt = attemptAt ?? masteryAt;
    }
    const unfinished = unfinishedMap.get(id);
    return {
      id,
      title: (p.title as string) ?? (p.exam_type as string) ?? "Sınav",
      examDate: (p.exam_date as string | null) ?? null,
      createdAt: (p.created_at as string) ?? new Date(0).toISOString(),
      lastActivityAt,
      unfinished: unfinished === undefined ? undefined : unfinished,
    };
  });

  const { focusPrepId, urgentChip } = selectFocusPrep({
    preps: focusCandidates,
    activeAttemptPrepId: (activeAttempt?.exam_prep_id as string | null) ?? null,
    cookiePrepId,
    now,
  });

  const focusPrep =
    prepList.find((p) => p.id === focusPrepId) ?? prepList[0] ?? undefined;

  const countdown = resolveExamCountdown({
    prepExamDate: (focusPrep?.exam_date as string | null) ?? null,
    prepTitle:
      (focusPrep?.title as string | null) ??
      (focusPrep?.exam_type as string | null) ??
      null,
    goalTargetDate: (goal?.target_date as string | null) ?? null,
  });

  const switchPreps: LearningHubSwitchPrep[] = prepList.map((p) => {
    const examDate = (p.exam_date as string | null) ?? null;
    return {
      id: p.id as string,
      title: (p.title as string) ?? (p.exam_type as string) ?? "Sınav",
      daysLeft: examDate ? daysUntilDate(examDate, now) : null,
    };
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
  let prepNodesSnapshot: { status?: string | null }[] = [];

  const primaryPrepId =
    (focusPrepId as string | undefined) ??
    (focusPrep?.id as string | undefined);

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

    const tracking = focusPrep?.learning_tracking as
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

    prepNodesSnapshot = nodes ?? [];
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
    typeof focusPrep?.daily_minutes === "number" && focusPrep.daily_minutes > 0
      ? (focusPrep.daily_minutes as number)
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

  const prepForScope =
    focusPrep ??
    (prepList[0] as
      | {
          document_id?: string | null;
          source_document_ids?: string[] | null;
        }
      | undefined);
  const scopedIds = scopedDocumentIdsForPrep(prepForScope ?? null);
  const processingCandidates =
    prepForScope && scopedIds.length === 0 ? [] : (processingDocs ?? []);
  const scopedProcessing = pickScopedProcessingDocument(
    processingCandidates.map((d) => ({
      id: d.id as string,
      file_name: d.file_name as string | null,
      topic_map_status: d.topic_map_status as string | null,
    })),
    scopedIds,
  );
  const hasRunnablePrepContent =
    Boolean(prepNodeForToday) ||
    prepNodesSnapshot.some((n) => {
      const status = n.status as string | null;
      return status === "ready" || status === "in_progress" || status === "completed";
    });
  const processingBlocks = processingBlocksNextAction({
    scopedProcessingId: scopedProcessing?.id ?? null,
    hasRunnablePrepContent,
  });
  const processing = processingBlocks ? scopedProcessing : null;

  const scopedFailed =
    scopedIds.length > 0
      ? (failedDocs ?? []).filter((d) => scopedIds.includes(d.id as string))
      : (failedDocs ?? []);

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
    const { isFeatureEnabled, ADAPTIVE_LEARNING_FLAG } = await import(
      "@/lib/admin/feature-flags"
    );
    if (
      onboardingComplete &&
      focusPrep?.id &&
      (await isFeatureEnabled(service, ADAPTIVE_LEARNING_FLAG, userId))
    ) {
      const { ensureCurrentDailyPlan } = await import(
        "@/lib/adaptive/daily-planner"
      );
      const plan = await ensureCurrentDailyPlan(service, {
        userId,
        examPrepId: focusPrep.id as string,
      });
      if (plan.items.length) {
        tasksOut = plan.items.map((item) => ({
          id: item.id,
          title: item.title,
          minutes: item.minutes,
          href:
            item.href ??
            `/deneme-sinavlari/${focusPrep.id}/oturum?planItemId=${item.id}`,
          kind: "prep_node" as const,
        }));
        minutesOut = plan.estimatedMinutes || minutesOut;
      }
      if (
        shouldRouteToAdaptiveSession({
          resumeHref,
          processing: processingBlocks,
        })
      ) {
        const firstPending =
          plan.items.find((item) => item.status === "pending" || item.status === "active") ??
          plan.items[0];
        nextBestAction = {
          kind: "exam_prep_node",
          href:
            firstPending?.href ??
            `/deneme-sinavlari/${focusPrep.id}/oturum`,
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
    failedDocuments: scopedFailed.map((d) => ({
      id: d.id as string,
      fileName: (d.file_name as string) || "Belge",
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
    focusPrepId: focusPrepId ?? (focusPrep?.id as string | null) ?? null,
    urgentChip,
    switchPreps,
  };
}
