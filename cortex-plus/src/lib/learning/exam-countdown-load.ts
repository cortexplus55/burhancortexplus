import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { STUDIO_EXAM_TYPE } from "@/lib/learning/studio-exam";
import { resolveExamCountdown, type CountdownCandidate, type ExamCountdown } from "@/lib/learning/exam-countdown";

/**
 * Aktif `exam_preps.exam_date` varsa onu, yoksa `learning_goals.target_date`.
 * Hedef puan ve stüdyo denemesi satırları sayılmaz.
 */
export async function loadNearestExamCountdown(
  supabase: SupabaseClient,
  userId: string,
): Promise<ExamCountdown> {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const [{ data: preps }, { data: goal }] = await Promise.all([
    supabase
      .from("exam_preps")
      .select("title, exam_date, created_at")
      .eq("user_id", userId)
      .neq("exam_type", "hedef")
      .neq("exam_type", STUDIO_EXAM_TYPE)
      .not("exam_date", "is", null)
      .gte("exam_date", today)
      .order("exam_date", { ascending: true })
      .limit(20),
    supabase
      .from("learning_goals")
      .select("target_date")
      .eq("user_id", userId)
      .not("target_date", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const candidates: CountdownCandidate[] = (preps ?? []).flatMap((row) => {
    if (typeof row.exam_date !== "string") return [];
    return [{
      examDate: row.exam_date,
      title: typeof row.title === "string" ? row.title : null,
      createdAt: typeof row.created_at === "string" ? row.created_at : null,
    }];
  });

  return resolveExamCountdown({
    candidates,
    goalTargetDate: candidates.length ? null : typeof goal?.target_date === "string" ? goal.target_date : null,
  });
}
