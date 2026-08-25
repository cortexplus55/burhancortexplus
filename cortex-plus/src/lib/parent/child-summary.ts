import "server-only";
import { createServiceClient } from "@/lib/supabase/server";

export type ChildSummary = {
  examAttempts: number;
  averageScore: number | null;
  lastExamAt: string | null;
  quizAttempts: number;
  openTasks: number;
  activeDays: number;
  weakTopics: string[];
};

const WINDOW_DAYS = 30;

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

  const [exams, quizzes, tasks, conversations, weak] = await Promise.all([
    service
      .from("practice_exam_attempts")
      .select("score, completed_at")
      .eq("user_id", studentId)
      .gte("created_at", since),
    service
      .from("quiz_attempts")
      .select("id", { count: "exact", head: true })
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
  ]);

  const attempts = exams.data ?? [];
  const scored = attempts.filter((a) => typeof a.score === "number");
  const averageScore = scored.length
    ? Math.round(
        scored.reduce((sum, a) => sum + Number(a.score ?? 0), 0) / scored.length,
      )
    : null;

  const lastExamAt =
    attempts
      .map((a) => a.completed_at as string | null)
      .filter((d): d is string => Boolean(d))
      .sort()
      .at(-1) ?? null;

  const activeDays = new Set(
    (conversations.data ?? []).map((c) =>
      String(c.updated_at).slice(0, 10),
    ),
  ).size;

  return {
    examAttempts: attempts.length,
    averageScore,
    lastExamAt,
    quizAttempts: quizzes.count ?? 0,
    openTasks: tasks.count ?? 0,
    activeDays,
    weakTopics: (weak.data ?? [])
      .map((w) => (w.topic_label as string | null) ?? "")
      .filter(Boolean),
  };
}
