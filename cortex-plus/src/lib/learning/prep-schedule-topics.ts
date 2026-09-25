import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pickMainTopics } from "@/lib/learning/diagnostic";
import { schedulePriorityForTopic } from "@/lib/learning/exam-coverage";
import type { ScheduleTopicInput } from "@/lib/learning/exam-schedule-v2";
import { remapPrerequisites, mergeTopicGroups } from "@/lib/learning/topic-merge";
import { orderTopicsForPath } from "@/lib/learning/topic-order";
import { parseTeacherAnalysis, type TeacherAnalysis } from "@/lib/learning/teacher-brain";

export type PrepScheduleTopics = {
  titles: string[];
  nodeIds: (string | null)[];
  scheduleTopics: ScheduleTopicInput[];
};

/**
 * Hazırlıktaki her belgenin konu haritasını birleştirir. Daha az önemli
 * konu da kalır; öncelik yalnızca sıra ve süreyi değiştirir.
 * Analiz hazır değilse konu yine girer, öncelik orta sayılır.
 */
export async function loadScheduleTopics(
  service: SupabaseClient,
  documentIds: string[],
  hardTopics: string[],
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

  const drafts: {
    id: string;
    title: string;
    pages: number[];
    documentId: string;
    fileName: string;
    prerequisites: string[];
  }[][] = [];

  for (const documentId of documentIds) {
    const { data: nodes } = await service
      .from("document_topic_nodes")
      .select("id, title, parent_id, sort_order, prerequisites")
      .eq("document_id", documentId)
      .order("sort_order");
    const mains = pickMainTopics(
      (nodes ?? []).map((node) => ({
        id: node.id as string,
        title: node.title as string,
        parentId: (node.parent_id as string | null) ?? null,
      })),
    );
    if (!mains.length) continue;
    const mainRows = (nodes ?? []).filter((node) => mains.some((main) => main.id === node.id));
    const { data: links } = await service
      .from("document_topic_page_links")
      .select("topic_id, page_number")
      .eq("document_id", documentId)
      .in(
        "topic_id",
        mainRows.map((node) => node.id as string),
      );
    const pagesByTopic = new Map<string, number[]>();
    for (const link of links ?? []) {
      const list = pagesByTopic.get(link.topic_id as string) ?? [];
      list.push(link.page_number as number);
      pagesByTopic.set(link.topic_id as string, list);
    }
    const { data: doc } = await service
      .from("documents")
      .select("file_name")
      .eq("id", documentId)
      .maybeSingle();
    const fileName = (doc?.file_name as string | null) ?? "";
    drafts.push(
      mainRows.map((node) => ({
        id: node.id as string,
        title: String(node.title),
        pages: [...new Set(pagesByTopic.get(node.id as string) ?? [])].sort((a, b) => a - b),
        documentId,
        fileName,
        prerequisites: Array.isArray(node.prerequisites) ? (node.prerequisites as string[]) : [],
      })),
    );
  }

  const merged = orderTopicsForPath(remapPrerequisites(mergeTopicGroups(drafts).topics), {
    manualOrder: false,
  });
  const titles = merged.map((topic) => topic.title);
  const nodeIds = merged.map((topic) => topic.nodeIds[0] ?? null);
  const scheduleTopics: ScheduleTopicInput[] = merged.map((topic) => ({
    id: topic.nodeIds[0] ?? topic.title,
    title: topic.title,
    prerequisites: topic.prerequisites,
    pageNumbers: topic.pages,
    measuredLevel: "unknown",
    selfHard: hardSet.has(topic.title.trim().toLocaleLowerCase("tr")),
    priority: schedulePriorityForTopic(groups, topic.title),
    sourceRefs: topic.sources,
  }));

  return { titles, nodeIds, scheduleTopics };
}
