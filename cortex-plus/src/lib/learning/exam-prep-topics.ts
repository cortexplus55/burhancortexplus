import type { SupabaseClient } from "@supabase/supabase-js";
import { mapPrepTopics, type PrepTopic } from "@/lib/learning/exam-prep-progress";

export type TopicLesson = {
  id: string;
  title: string;
  contentMd: string;
};

const NOTE_PREFIX = "Sınav notu:";

function isStudyNote(title: string) {
  return title.startsWith(NOTE_PREFIX);
}

export function mapLessonsByTopic(
  rows: {
    id: string;
    title: string;
    content_md: string | null;
    topic_id?: string | null;
  }[],
  topics: PrepTopic[],
): Record<string, TopicLesson> {
  const byTopic: Record<string, TopicLesson> = {};
  const byId = new Map(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        title: row.title,
        contentMd: row.content_md ?? "",
      } satisfies TopicLesson,
    ]),
  );

  for (const row of rows) {
    if (!row.topic_id) continue;
    byTopic[row.topic_id] = {
      id: row.id,
      title: row.title,
      contentMd: row.content_md ?? "",
    };
  }

  for (const topic of topics) {
    if (byTopic[topic.id] || !topic.lessonId) continue;
    const lesson = byId.get(topic.lessonId);
    if (lesson) byTopic[topic.id] = lesson;
  }

  return byTopic;
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
