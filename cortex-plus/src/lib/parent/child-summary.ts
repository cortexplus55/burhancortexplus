import "server-only";
import { createServiceClient } from "@/lib/supabase/server";
import { buildStudyDayFlags, planBadgeFromName } from "@/lib/parent/study-days";

export type ChildExamRow = {
  title: string;
  score: number | null;
  at: string | null;
};

export type ChildTopicRow = {
  label: string;
  severity: number;
};

export type ChildSummary = {
  examAttempts: number;
  averageScore: number | null;
  lastExamAt: string | null;
  quizAttempts: number;
  openTasks: number;
  activeDays: number;
  weakTopics: string[];
  topics: ChildTopicRow[];
  recentExams: ChildExamRow[];
  studyDayFlags: boolean[];
  hasPlus: boolean;
  planBadge: "Plus" | "Sigma" | null;
};

const WINDOW_DAYS = 30;
const ACTIVITY_DAYS = 14;

function examTitle(value: unknown): string {
  if (Array.isArray(value)) {
    return (value[0] as { title?: string } | undefined)?.title ?? "Deneme";
  }
  return (value as { title?: string } | null)?.title ?? "Deneme";
}

/**
 * Veli özeti yalnızca onaylanmış bağlantıda üretilir ve toplu veriyle sınırlıdır.
 * Sohbet içeriği hiçbir koşulda dönmez.
 */
export async function getChildSummary(
  parentId: string,
  studentId: string,
): Promise<ChildSummary | null> {
  const service = createServiceClient();

  const { data: link } = await service
    .from("parent_student_links")
    .select("id")
    .eq("parent_id", parentId)
    .eq("student_id", studentId)
    .eq("status", "active")
    .maybeSingle();

  if (!link) return null;

  const since = new Date(
    Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [exams, quizzes, tasks, conversations, weak, subscription] =
    await Promise.all([
      service
        .from("practice_exam_attempts")
        .select("score, completed_at, created_at, practice_exams(title)")
        .eq("user_id", studentId)
        .gte("created_at", since)
        .order("created_at", { ascending: false }),
      service
        .from("quiz_attempts")
        .select("id, created_at", { count: "exact" })
        .eq("user_id", studentId)
        .gte("created_at", since),
      service
        .from("study_plan_tasks")
        .select("id, study_plans!inner(user_id)", { count: "exact", head: true })
        .eq("study_plans.user_id", studentId)
        .eq("completed", false),
      service
        .from("conversations")
        .select("updated_at")
        .eq("user_id", studentId)
        .gte("updated_at", since),
      service
        .from("weak_topics")
        .select("topic_label, severity")
        .eq("user_id", studentId)
        .order("severity", { ascending: false })
        .limit(3),
      service
        .from("subscriptions")
        .select("status, plans(name, is_premium)")
        .eq("user_id", studentId)
        .eq("status", "active")
        .limit(1)
        .maybeSingle(),
    ]);

  const attempts = exams.data ?? [];
  const scored = attempts.filter((row) => typeof row.score === "number");
  const averageScore = scored.length
    ? Math.round(
        scored.reduce((sum, row) => sum + Number(row.score ?? 0), 0) /
          scored.length,
      )
    : null;

  const lastExamAt =
    attempts
      .map((row) => (row.completed_at ?? row.created_at) as string | null)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;

  const activityStamps = [
    ...(conversations.data ?? []).map((row) => String(row.updated_at)),
    ...(quizzes.data ?? []).map((row) => String(row.created_at)),
    ...attempts.map((row) =>
      String(row.completed_at ?? row.created_at ?? ""),
    ),
  ].filter(Boolean);

  const studyDayFlags = buildStudyDayFlags(activityStamps, ACTIVITY_DAYS);
  const activeDays = new Set(
    activityStamps.map((stamp) => stamp.slice(0, 10)),
  ).size;

  const topics: ChildTopicRow[] = (weak.data ?? [])
    .map((row) => ({
      label: (row.topic_label as string | null) ?? "",
      severity: Number(row.severity ?? 0),
    }))
    .filter((row) => row.label);

  const plan = subscription.data?.plans as
    | { name?: string; is_premium?: boolean }
    | { name?: string; is_premium?: boolean }[]
    | null;
  const planRow = Array.isArray(plan) ? plan[0] : plan;
  const hasPlus = Boolean(subscription.data);
  const planBadge = hasPlus
    ? planBadgeFromName(planRow?.name) ??
      (planRow?.is_premium ? "Sigma" : "Plus")
    : null;

  return {
    examAttempts: attempts.length,
    averageScore,
    lastExamAt,
    quizAttempts: quizzes.count ?? 0,
    openTasks: tasks.count ?? 0,
    activeDays,
    weakTopics: topics.map((topic) => topic.label),
    topics,
    recentExams: attempts.slice(0, 3).map((row) => ({
      title: examTitle(row.practice_exams),
      score: typeof row.score === "number" ? Number(row.score) : null,
      at: (row.completed_at ?? row.created_at) as string | null,
    })),
    studyDayFlags,
    hasPlus,
    planBadge,
  };
}
