import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { schedulePriorityForTopic } from "@/lib/learning/exam-coverage";
import type { ScheduleTopicInput } from "@/lib/learning/exam-schedule-v2";
import { consolidatePrepDocuments } from "@/lib/learning/consolidate-documents";
import { priorityFromWeight } from "@/lib/learning/cross-material-topics";
import { orderTopicsForPath } from "@/lib/learning/topic-order";
import { parseTeacherAnalysis, type TeacherAnalysis } from "@/lib/learning/teacher-brain";

export type PrepScheduleTopics = {
  titles: string[];
  nodeIds: (string | null)[];
  scheduleTopics: ScheduleTopicInput[];
};

/**
 * Hazırlıktaki bütün belgelerin konularını tek listeye indirir.
 *
 * Müfredat varsa pay ve "sınavda ağırlıklı" işareti süreye ve sıraya girer.
 * Model burada çağrılmaz: konu listesini öğrenci sihirbazda gördüğü
 * deterministik birleştirmeyle eşleriz, ikinci bir kredi harcanmaz.
 */
export async function loadScheduleTopics(
  service: SupabaseClient,
  documentIds: string[],
  hardTopics: string[],
  userId = "",
): Promise<PrepScheduleTopics> {
  const hardSet = new Set(hardTopics.map((topic) => topic.trim().toLocaleLowerCase("tr")));
  const groups: { documentId: string; analysis: TeacherAnalysis }[] = [];
  const { data: analyses, error: analysisError } = await service
    .from("document_teacher_analyses")
    .select("document_id, status, analysis")
    .in("document_id", documentIds);
  if (!analysisError) {
    for (const row of analyses ?? []) {
      if (row.status !== "ready") continue;
      const analysis = parseTeacherAnalysis(row.analysis);
      if (!analysis) continue;
      groups.push({ documentId: row.document_id as string, analysis });
    }
  }

  const consolidated = await consolidatePrepDocuments(service, userId, documentIds, {
    allowModel: false,
  });
  const weighted = consolidated.topics.map((topic) => ({
    ...topic,
    priority: priorityFromWeight(topic) ?? schedulePriorityForTopic(groups, topic.title),
  }));
  const ordered = orderTopicsForPath(weighted, { manualOrder: false });
  const titles = ordered.map((topic) => topic.title);
  const nodeIds = ordered.map((topic) => topic.nodeIds[0] ?? null);
  const scheduleTopics: ScheduleTopicInput[] = ordered.map((topic) => ({
    id: topic.nodeIds[0] ?? topic.title,
    title: topic.title,
    objective:
      topic.sections
        .map((section) => section.title)
        .filter(Boolean)
        .join(" · ") || topic.summary || null,
    prerequisites: topic.prerequisites,
    pageNumbers: topic.pages,
    measuredLevel: "unknown",
    selfHard: hardSet.has(topic.title.trim().toLocaleLowerCase("tr")),
    priority: topic.priority,
    weightPercent: topic.weightPercent,
    examHeavy: topic.examHeavy,
    sourceRefs: topic.sources,
  }));

  return { titles, nodeIds, scheduleTopics };
}
