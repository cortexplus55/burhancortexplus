import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { analyzePages, type PageAnalysis } from "@/lib/documents/page-analysis";
import { buildCoverageReport, type CoverageReport } from "@/lib/documents/coverage";
import type { TopicDraft } from "@/lib/documents/topic-map";
import { buildTopicMapLLM } from "@/lib/documents/topic-map-llm";

export type PdfLearningV2Result = {
  ok: boolean;
  topics: number;
  coverage: CoverageReport | null;
  error?: string;
};

async function clearTopicMap(service: SupabaseClient, documentId: string) {
  // Links cascade from topics; delete topics first for a clean rebuild.
  await service.from("document_topic_nodes").delete().eq("document_id", documentId);
  await service.from("document_coverage_reports").delete().eq("document_id", documentId);
}

async function loadPageRows(service: SupabaseClient, documentId: string) {
  const { data, error } = await service
    .from("document_pages")
    .select("id, page_number, text_content")
    .eq("document_id", documentId)
    .order("page_number", { ascending: true });
  if (error) throw new Error("page_load_failed");
  return data ?? [];
}

async function persistPageMeta(
  service: SupabaseClient,
  pageId: string,
  analysis: PageAnalysis,
) {
  const { error } = await service
    .from("document_pages")
    .update({
      extraction_ok: analysis.extractionOk,
      page_kind: analysis.pageKind,
      headings: analysis.headings,
      formulas: analysis.formulas,
      tables_detected: analysis.tablesDetected,
      images_detected: analysis.imagesDetected,
      uncertain_regions: analysis.uncertainRegions,
      extraction_method: analysis.extractionMethod,
      char_count: analysis.charCount,
    })
    .eq("id", pageId);
  if (error) throw new Error("page_meta_update_failed");
}

async function persistTopics(
  service: SupabaseClient,
  documentId: string,
  topics: TopicDraft[],
  pageIdByNumber: Map<number, string>,
) {
  const topicIdByMergeKey = new Map<string, string>();

  for (const [index, topic] of topics.entries()) {
    const { data, error } = await service
      .from("document_topic_nodes")
      .insert({
        document_id: documentId,
        parent_id: null,
        sort_order: index,
        title: topic.title,
        learning_objective: topic.learningObjective,
        prerequisites: topic.prerequisites,
        key_definitions: topic.keyDefinitions,
        key_relations: topic.keyRelations,
        worked_examples: topic.workedExamples,
        common_mistakes: topic.commonMistakes,
        source_exercises: topic.sourceExercises,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error("topic_insert_failed");
    topicIdByMergeKey.set(topic.mergeKey, data.id);

    for (const pageNumber of topic.pageNumbers) {
      const pageId = pageIdByNumber.get(pageNumber);
      if (!pageId) continue;
      const { error: linkError } = await service
        .from("document_topic_page_links")
        .insert({
          document_id: documentId,
          topic_id: data.id,
          page_id: pageId,
          page_number: pageNumber,
          relevance: "primary",
        });
      if (linkError) throw new Error("topic_link_failed");
    }
  }

  return topicIdByMergeKey;
}

async function persistCoverage(
  service: SupabaseClient,
  documentId: string,
  coverage: CoverageReport,
) {
  const { error } = await service.from("document_coverage_reports").upsert(
    {
      document_id: documentId,
      total_pages: coverage.totalPages,
      content_pages: coverage.contentPages,
      covered_pages: coverage.coveredPages,
      skipped_pages: coverage.skippedPages,
      unreadable_pages: coverage.unreadablePages,
      uncovered_content_pages: coverage.uncoveredContentPages,
      merged_titles: coverage.mergedTitles,
      status: coverage.status,
      summary: coverage.summary,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "document_id" },
  );
  if (error) throw new Error("coverage_upsert_failed");
}

/**
 * After classic RAG page/chunk insert, enrich pages + build topic map + coverage.
 * Safe to call only when pdf_learning_v2 is enabled.
 */
export async function runPdfLearningV2(
  service: SupabaseClient,
  documentId: string,
): Promise<PdfLearningV2Result> {
  await service
    .from("documents")
    .update({
      topic_map_status: "pending",
      topic_map_error: null,
      topic_map_updated_at: new Date().toISOString(),
    })
    .eq("id", documentId);

  try {
    await clearTopicMap(service, documentId);

    const { data: docRow } = await service
      .from("documents")
      .select("user_id, file_name")
      .eq("id", documentId)
      .maybeSingle();

    const rows = await loadPageRows(service, documentId);
    const texts = rows.map((row) => row.text_content ?? "");
    const analyses = analyzePages(texts);
    const pageIdByNumber = new Map(
      rows.map((row) => [row.page_number as number, row.id as string]),
    );

    for (const analysis of analyses) {
      const pageId = pageIdByNumber.get(analysis.pageNumber);
      if (!pageId) continue;
      await persistPageMeta(service, pageId, analysis);
    }

    // Konu haritası modelin belgeyi okumasıyla çıkar. Eskiden model
    // başarısız olduğunda sezgisel haritaya düşülüyordu; o harita bir
    // trigonometri fikstürüne ayarlı olduğu için pediatri belgesinde
    // "Derece ve radyan" ve "Sayfa 4 içeriği" konuları üretti. Yanlış
    // harita, harita olmamasından kötü: öğrenci çalıştığı konuyu değil
    // başka bir dersi görüyor ve ürüne güveni bitiyor. Artık yedek yok;
    // çıkmazsa belge "failed" işaretlenir ve öğrenci tekrar dener.
    const llmMap = docRow?.user_id
      ? await buildTopicMapLLM(
          service,
          documentId,
          docRow.user_id as string,
          (docRow.file_name as string) ?? "belge",
          analyses,
        )
      : null;
    if (!llmMap) throw new Error("topic_map_unavailable");
    const { topics, mergedTitles } = llmMap;
    await persistTopics(service, documentId, topics, pageIdByNumber);

    const coverage = buildCoverageReport(analyses, topics, mergedTitles);
    await persistCoverage(service, documentId, coverage);

    const { error: docError } = await service
      .from("documents")
      .update({
        topic_map_status: "ready",
        topic_map_error: null,
        topic_map_updated_at: new Date().toISOString(),
      })
      .eq("id", documentId);
    if (docError) throw new Error("document_status_update_failed");

    return { ok: true, topics: topics.length, coverage };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "topic_map_failed";
    console.error("pdf learning v2 failed", { name: message });
    await service
      .from("documents")
      .update({
        topic_map_status: "failed",
        topic_map_error: message,
        topic_map_updated_at: new Date().toISOString(),
      })
      .eq("id", documentId);
    return { ok: false, topics: 0, coverage: null, error: message };
  }
}

export type TopicMapSnapshot = {
  documentId: string;
  sourceBoundaryMode: "documents_only" | "allow_supporting";
  topicMapStatus: string;
  topicMapError: string | null;
  topics: {
    id: string;
    title: string;
    learningObjective: string | null;
    prerequisites: string[];
    keyDefinitions: string[];
    keyRelations: string[];
    workedExamples: string[];
    commonMistakes: string[];
    sourceExercises: string[];
    studentNotes: string | null;
    isStudentEdited: boolean;
    sortOrder: number;
    pageNumbers: number[];
  }[];
  pages: {
    id: string;
    pageNumber: number;
    pageKind: string;
    extractionOk: boolean;
    headings: string[];
    formulas: string[];
    uncertainRegions: string[];
    extractionMethod: string;
    charCount: number;
  }[];
  coverage: CoverageReport | null;
};

export async function loadTopicMapSnapshot(
  service: SupabaseClient,
  documentId: string,
): Promise<TopicMapSnapshot | null> {
  const { data: doc } = await service
    .from("documents")
    .select(
      "id, source_boundary_mode, topic_map_status, topic_map_error",
    )
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return null;

  const [{ data: topics }, { data: pages }, { data: links }, { data: coverageRow }] =
    await Promise.all([
      service
        .from("document_topic_nodes")
        .select(
          "id, title, learning_objective, prerequisites, key_definitions, key_relations, worked_examples, common_mistakes, source_exercises, student_notes, is_student_edited, sort_order",
        )
        .eq("document_id", documentId)
        .order("sort_order", { ascending: true }),
      service
        .from("document_pages")
        .select(
          "id, page_number, page_kind, extraction_ok, headings, formulas, uncertain_regions, extraction_method, char_count",
        )
        .eq("document_id", documentId)
        .order("page_number", { ascending: true }),
      service
        .from("document_topic_page_links")
        .select("topic_id, page_number")
        .eq("document_id", documentId),
      service
        .from("document_coverage_reports")
        .select(
          "total_pages, content_pages, covered_pages, skipped_pages, unreadable_pages, uncovered_content_pages, merged_titles, status, summary",
        )
        .eq("document_id", documentId)
        .maybeSingle(),
    ]);

  const pagesByTopic = new Map<string, number[]>();
  for (const link of links ?? []) {
    const list = pagesByTopic.get(link.topic_id) ?? [];
    list.push(link.page_number);
    pagesByTopic.set(link.topic_id, list);
  }

  const coverage: CoverageReport | null = coverageRow
    ? {
        totalPages: coverageRow.total_pages,
        contentPages: coverageRow.content_pages,
        coveredPages: coverageRow.covered_pages,
        skippedPages: coverageRow.skipped_pages ?? [],
        unreadablePages: coverageRow.unreadable_pages ?? [],
        uncoveredContentPages: coverageRow.uncovered_content_pages ?? [],
        mergedTitles: coverageRow.merged_titles ?? [],
        status: coverageRow.status,
        summary: coverageRow.summary ?? "",
      }
    : null;

  return {
    documentId: doc.id,
    sourceBoundaryMode:
      doc.source_boundary_mode === "allow_supporting"
        ? "allow_supporting"
        : "documents_only",
    topicMapStatus: doc.topic_map_status ?? "none",
    topicMapError: doc.topic_map_error,
    topics: (topics ?? []).map((topic) => ({
      id: topic.id,
      title: topic.title,
      learningObjective: topic.learning_objective,
      prerequisites: topic.prerequisites ?? [],
      keyDefinitions: topic.key_definitions ?? [],
      keyRelations: topic.key_relations ?? [],
      workedExamples: topic.worked_examples ?? [],
      commonMistakes: topic.common_mistakes ?? [],
      sourceExercises: topic.source_exercises ?? [],
      studentNotes: topic.student_notes,
      isStudentEdited: Boolean(topic.is_student_edited),
      sortOrder: topic.sort_order,
      pageNumbers: [...new Set(pagesByTopic.get(topic.id) ?? [])].sort(
        (a, b) => a - b,
      ),
    })),
    pages: (pages ?? []).map((page) => ({
      id: page.id,
      pageNumber: page.page_number,
      pageKind: page.page_kind ?? "content",
      extractionOk: page.extraction_ok ?? true,
      headings: page.headings ?? [],
      formulas: page.formulas ?? [],
      uncertainRegions: page.uncertain_regions ?? [],
      extractionMethod: page.extraction_method ?? "text_layer",
      charCount: page.char_count ?? 0,
    })),
    coverage,
  };
}
