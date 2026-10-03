import type { SupabaseClient } from "@supabase/supabase-js";
import { mapPrepTopics, type PrepTopic } from "@/lib/learning/exam-prep-progress";

const NOTE_PREFIX = "Sınav notu:";

function isStudyNote(title: string) {
  return title.startsWith(NOTE_PREFIX);
}

export async function loadOrBackfillTopics(
  supabase: SupabaseClient,
  prepId: string,
  studyPlanId?: string | null,
): Promise<PrepTopic[]> {
  const { data } = await supabase
    .from("exam_prep_topics")
    .select("id, label, sort_order, status, lesson_id")
    .eq("exam_prep_id", prepId)
    .order("sort_order");

  const existing = mapPrepTopics(data ?? []);
  if (existing.length || !studyPlanId) return existing;

  const { data: tasks } = await supabase
    .from("study_plan_tasks")
    .select("title, sort_order")
    .eq("plan_id", studyPlanId)
    .order("sort_order");

  const labels = (tasks ?? [])
    .map((task) => String(task.title ?? "").trim())
    .filter((title) => title.length > 0 && !isStudyNote(title));

  if (!labels.length) return existing;

  await supabase.from("exam_prep_topics").insert(
    labels.map((label, sort_order) => ({
      exam_prep_id: prepId,
      label,
      sort_order,
      status: "ready",
    })),
  );

  const { data: filled } = await supabase
    .from("exam_prep_topics")
    .select("id, label, sort_order, status, lesson_id")
    .eq("exam_prep_id", prepId)
    .order("sort_order");

  return mapPrepTopics(filled ?? []);
}
