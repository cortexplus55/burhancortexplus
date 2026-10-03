import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { analyzePage, type PageAnalysis } from "@/lib/documents/page-analysis";
import { buildCoverageReport, type CoverageReport } from "@/lib/documents/coverage";
import { draftFromLlmTopic, type TopicDraft } from "@/lib/documents/topic-map";
import { buildTopicMapLLM, completeTopicPageLinks, pagesForTopicMap } from "@/lib/documents/topic-map-llm";
import { runTeacherAnalysis } from "@/lib/documents/teacher-analysis-run";
import {
  shouldRewriteStoredTopicMap,
  consolidateTopics,
  type FoldPage,
} from "@/lib/documents/topic-fold";
import { replaceTopicNodes } from "@/lib/documents/topic-map-refold";
import { MAIN_TOPIC_MAX } from "@/lib/documents/topic-main-groups";
import { groupIntoMainTopics } from "@/lib/documents/topic-main-groups-llm";
import { isJunkTopicTitle } from "@/lib/documents/topic-title";
import { isRunningHeader, repeatedEdgeLines } from "@/lib/documents/clean-text";
import type { ConceptUnit } from "@/lib/documents/concept-units";
import { buildConceptUnits } from "@/lib/documents/concept-units-run";
import { exclusivePageRanges } from "@/lib/documents/topic-page-ranges";

export type PdfLearningV2Result = {
  ok: boolean;
  /** Further bounded map windows are pending; caller returns 202 and retries. */
  pending?: boolean;
  topics: number;
  coverage: CoverageReport | null;
  error?: string;
  windowsDone?: number;
  windowsTotal?: number;
};

const MAP_WINDOW_PAGES = 12;
const PAGE_READ_BATCH = 200;
const MAP_LEASE_MS = 240_000;

type MapCheckpointTopic = {
  title: string;
  learningObjective: string | null;
  pageNumbers: number[];
};

type MapJob = {
  next_index: number;
  topics: MapCheckpointTopic[];
  lease_token: string | null;
};

export function topicMapWindows<T>(pages: T[], windowSize = MAP_WINDOW_PAGES): T[][] {
  const windows: T[][] = [];
  for (let offset = 0; offset < pages.length; offset += windowSize) {
    windows.push(pages.slice(offset, offset + windowSize));
  }
  return windows;
}

async function claimMapJob(service: SupabaseClient, documentId: string): Promise<MapJob | null> {
  const { error: insertError } = await service.from("document_topic_map_jobs")
    .insert({ document_id: documentId });
  if (insertError && insertError.code !== "23505") throw new Error("topic_map_job_insert_failed");

  const token = crypto.randomUUID();
  const now = new Date();
  const { data, error } = await service.from("document_topic_map_jobs")
    .update({
      lease_token: token,
      lease_until: new Date(now.getTime() + MAP_LEASE_MS).toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("document_id", documentId)
    .or(`lease_until.is.null,lease_until.lt.${now.toISOString()}`)
    .select("next_index, topics, lease_token")
    .maybeSingle();
  if (error) throw new Error("topic_map_job_claim_failed");
  return data ? {
    next_index: data.next_index as number,
    topics: Array.isArray(data.topics) ? data.topics as MapCheckpointTopic[] : [],
    lease_token: data.lease_token as string,
  } : null;
}

async function releaseMapJob(service: SupabaseClient, documentId: string, token: string) {
  await service.from("document_topic_map_jobs")
    .update({ lease_token: null, lease_until: null, updated_at: new Date().toISOString() })
    .eq("document_id", documentId)
    .eq("lease_token", token);
}

async function clearTopicMap(service: SupabaseClient, documentId: string) {
  // Links cascade from topics; delete topics first for a clean rebuild.
  await service.from("document_topic_nodes").delete().eq("document_id", documentId);
  await service.from("document_coverage_reports").delete().eq("document_id", documentId);
}

async function loadPageRows(service: SupabaseClient, documentId: string) {
  const rows: {
    id: string;
    page_number: number;
    text_content: string | null;
    extraction_ok: boolean | null;
    page_kind: string | null;
  }[] = [];
  for (let offset = 0; ; offset += PAGE_READ_BATCH) {
    const { data, error } = await service.from("document_pages")
      .select("id, page_number, text_content, extraction_ok, page_kind")
      .eq("document_id", documentId)
      .order("page_number", { ascending: true })
      .range(offset, offset + PAGE_READ_BATCH - 1);
    if (error) throw new Error("page_load_failed");
    rows.push(...((data ?? []) as typeof rows));
    if ((data ?? []).length < PAGE_READ_BATCH) break;
  }
  return rows;
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
  /** Konu sırasına göre kavram birimleri; boş dizi: plan mekanik bölmeye döner. */
  units: ConceptUnit[][] = [],
) {
  const topicIdByMergeKey = new Map<string, string>();
  if (!topics.length) return topicIdByMergeKey;
  const { data: saved, error: topicError } = await service
    .from("document_topic_nodes")
    .insert(topics.map((topic, index) => ({
        document_id: documentId,
        parent_id: null,
        sort_order: index,
        units: units[index] ?? [],
        title: topic.title,
        learning_objective: topic.learningObjective,
        prerequisites: topic.prerequisites,
        key_definitions: topic.keyDefinitions,
        key_relations: topic.keyRelations,
        worked_examples: topic.workedExamples,
        common_mistakes: topic.commonMistakes,
        source_exercises: topic.sourceExercises,
      })))
    .select("id, sort_order");
  if (topicError || !saved || saved.length !== topics.length) throw new Error("topic_insert_failed");
  const idByOrder = new Map(saved.map((row) => [row.sort_order as number, row.id as string]));
  const links: {
    document_id: string; topic_id: string; page_id: string;
    page_number: number; relevance: "primary";
  }[] = [];
  for (const [index, topic] of topics.entries()) {
    const id = idByOrder.get(index);
    if (!id) throw new Error("topic_insert_failed");
    topicIdByMergeKey.set(topic.mergeKey, id);
    for (const pageNumber of topic.pageNumbers) {
      const pageId = pageIdByNumber.get(pageNumber);
      if (!pageId) continue;
      links.push({
        document_id: documentId, topic_id: id, page_id: pageId,
        page_number: pageNumber, relevance: "primary",
      });
    }
  }
  for (let offset = 0; offset < links.length; offset += 200) {
    const { error: linkError } = await service.from("document_topic_page_links")
      .insert(links.slice(offset, offset + 200));
    if (linkError) throw new Error("topic_link_failed");
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
  let previousMapStatus: string | null = null;
  try {
    const { data: docRow, error: docLoadError } = await service
      .from("documents")
      .select("user_id, file_name, mime_type, topic_map_status")
      .eq("id", documentId)
      .is("deleted_at", null)
      .maybeSingle();
    if (docLoadError || !docRow?.user_id) throw new Error("document_not_found");
    previousMapStatus = docRow.topic_map_status as string | null;

    // A preparation keeps stable document_topic_node_id references. A rebuild
    // may not delete those nodes after the learner has started using them.
    if (previousMapStatus === "ready" || previousMapStatus === "reviewed") {
      const inUse = await documentTopicMapIsInUse(service, documentId, []).catch(() => true);
      if (inUse) {
        return { ok: false, topics: 0, coverage: null, error: "topic_map_in_use" };
      }
    }

    const { error: pendingError } = await service.from("documents")
      .update({
        topic_map_status: "pending",
        topic_map_error: null,
        topic_map_updated_at: new Date().toISOString(),
      })
      .eq("id", documentId);
    if (pendingError) throw new Error("topic_map_status_update_failed");

    const rows = await loadPageRows(service, documentId);
    const analyses = rows.map((row) => {
      const analysis = analyzePage(row.page_number, row.text_content ?? "");
      if (row.extraction_ok === false) {
        analysis.extractionOk = false;
        if (analysis.pageKind === "content" || analysis.pageKind === "uncertain") {
          analysis.pageKind = "unreadable";
        }
      }
      if (row.page_kind === "blank") analysis.pageKind = "blank";
      return analysis;
    });
    const pageIdByNumber = new Map(
      rows.map((row) => [row.page_number as number, row.id as string]),
    );
    const windows = topicMapWindows(pagesForTopicMap(analyses));
    if (!windows.length) throw new Error("topic_map_no_readable_pages");

    const job = await claimMapJob(service, documentId);
    if (!job) return { ok: true, pending: true, topics: 0, coverage: null };
    const token = job.lease_token!;
    try {
      if (job.next_index === 0) {
        // Independent page updates run in small parallel batches. Serial 99+
        // network requests consumed most of the old processing window.
        for (let offset = 0; offset < analyses.length; offset += 8) {
          await Promise.all(analyses.slice(offset, offset + 8).map(async (analysis) => {
            const pageId = pageIdByNumber.get(analysis.pageNumber);
            if (pageId) await persistPageMeta(service, pageId, analysis);
          }));
        }
      }

      let compactTopics = job.topics;
      if (job.next_index < windows.length) {
        // Teacher analysis is optional and can read the whole source. It is
        // useful on short notes; on long books bounded page windows carry the
        // actual teaching map without a whole-document model request.
        let teacherBrief: string | null = null;
        if (windows.length === 1) {
          const brain = await runTeacherAnalysis(service, documentId, {
            userId: docRow.user_id as string,
            fileName: (docRow.file_name as string) ?? "belge",
            mimeType: (docRow.mime_type as string | null) ?? null,
          });
          teacherBrief = brain.topicMapBrief;
        }

        const windowMap = await buildTopicMapLLM(
          service,
          documentId,
          docRow.user_id as string,
          (docRow.file_name as string) ?? "belge",
          windows[job.next_index],
          teacherBrief,
          windows.length > 1,
        );
        // Empty window: record and skip — fail only if the whole doc yields zero.
        if (!windowMap?.topics.length) {
          const nextIndex = job.next_index + 1;
          const nowIso = new Date().toISOString();
          const { data: saved, error: checkpointError } = await service
            .from("document_topic_map_jobs")
            .update({
              next_index: nextIndex,
              topics: compactTopics,
              updated_at: nowIso,
            })
            .eq("document_id", documentId)
            .eq("lease_token", token)
            .select("document_id");
          if (checkpointError || !saved?.length) throw new Error("topic_map_claim_lost");
          await service.from("documents").update({
            updated_at: nowIso,
            topic_map_updated_at: nowIso,
          }).eq("id", documentId);
          if (nextIndex < windows.length) {
            return {
              ok: true,
              pending: true,
              topics: compactTopics.length,
              coverage: null,
              windowsDone: nextIndex,
              windowsTotal: windows.length,
            };
          }
        } else {
        compactTopics = [...compactTopics, ...windowMap.topics.map((topic) => ({
          title: topic.title,
          learningObjective: topic.learningObjective,
          pageNumbers: topic.pageNumbers,
        }))];
        const nextIndex = job.next_index + 1;
        const nowIso = new Date().toISOString();
        const { data: saved, error: checkpointError } = await service
          .from("document_topic_map_jobs")
          .update({
            next_index: nextIndex,
            topics: compactTopics,
            updated_at: nowIso,
          })
          .eq("document_id", documentId)
          .eq("lease_token", token)
          .select("document_id");
        if (checkpointError || !saved?.length) throw new Error("topic_map_claim_lost");
        await service.from("documents").update({
          updated_at: nowIso,
          topic_map_updated_at: nowIso,
        }).eq("id", documentId);
        if (nextIndex < windows.length) {
          return {
            ok: true,
            pending: true,
            topics: compactTopics.length,
            coverage: null,
            windowsDone: nextIndex,
            windowsTotal: windows.length,
          };
        }
        }
      }

      if (!compactTopics.length) throw new Error("topic_map_unavailable");
      // Eski pencere kayıtlarında soru kökü kalmış olabilir; sayfaları
      // aşağıda en yakın konuya bağlanır.
      // Sayfa kenarında tekrar eden kitap başlığı konu değildir (2 Ekim 2026:
      // "KPSS HUKUKUN TEMEL KAVRAMLARI" konu adı olup s.5–28'i topluyordu).
      const edges = repeatedEdgeLines(analyses.map((analysis) => analysis.textContent ?? ""));
      const sourced = compactTopics.filter(
        (topic) => !isJunkTopicTitle(topic.title) && !isRunningHeader(topic.title, edges),
      );
      const drafted = (sourced.length ? sourced : compactTopics).map((topic, index) =>
        draftFromLlmTopic(topic.title, topic.learningObjective, topic.pageNumbers, analyses, index),
      );
      const consolidated = consolidateTopics(drafted, pagesForTopicMap(analyses), windows.flat().length);
      let topics = completeTopicPageLinks(
        consolidated.topics.map((topic, index) => ({
          ...draftFromLlmTopic(topic.title, topic.learningObjective, topic.pageNumbers, analyses, index),
          prerequisites: topic.prerequisites ?? [],
        })),
        analyses,
      );
      if (!topics.length) throw new Error("topic_map_unavailable");

      // Uzun belge: alt başlıklar 10–15 ana konuda toplanır (Astra gibi).
      // Olmazsa gruplanmamış harita kaydedilir.
      if (topics.length > MAIN_TOPIC_MAX) {
        const grouped = await groupIntoMainTopics(service, {
          userId: docRow.user_id as string,
          fileName: (docRow.file_name as string) ?? "belge",
          subs: topics.map((topic) => ({ title: topic.title, pageNumbers: topic.pageNumbers })),
        });
        if (grouped?.length) {
          topics = completeTopicPageLinks(
            grouped.map((topic, index) => ({
              ...draftFromLlmTopic(topic.title, topic.learningObjective, topic.pageNumbers, analyses, index),
              prerequisites: [],
            })),
            analyses,
          );
          consolidated.mergedTitles.push(
            ...grouped.map((topic) => ({
              kept: topic.title,
              dropped: topic.members.filter((member) => member !== topic.title),
            })).filter((merge) => merge.dropped.length),
          );
        }
      }

      // Her sayfa tek ana konuda, konular belge sırasıyla ardışık bloklar:
      // çakışan sayfa aynı bilgiyi iki derste anlattırıyordu (3 Ekim 2026).
      const ranged = exclusivePageRanges(topics);
      topics = ranged.topics.map((topic, index) => ({
        ...draftFromLlmTopic(topic.title, topic.learningObjective, topic.pageNumbers, analyses, index),
        prerequisites: topic.prerequisites,
        mergeKey: topic.mergeKey,
      }));
      consolidated.mergedTitles.push(...ranged.merged);

      // Büyük ana konular kavram birimlerine bölünür (2 Ekim 2026: "ana konu +
      // içinde dersler"); her birim çalışma planında ayrı ders olur.
      const units = await buildConceptUnits(service, {
        userId: docRow.user_id as string,
        documentId,
        topics: topics.map((topic) => ({ title: topic.title, pageNumbers: topic.pageNumbers })),
        analyses,
        edges,
      });

      await clearTopicMap(service, documentId);
      await persistTopics(service, documentId, topics, pageIdByNumber, units);
      const coverage = buildCoverageReport(analyses, topics, consolidated.mergedTitles);
      await persistCoverage(service, documentId, coverage);

      const { error: docError } = await service.from("documents")
        .update({
          topic_map_status: "ready",
          topic_map_error: null,
          topic_map_updated_at: new Date().toISOString(),
        })
        .eq("id", documentId);
      if (docError) throw new Error("document_status_update_failed");

      await service.from("document_topic_map_jobs")
        .delete().eq("document_id", documentId).eq("lease_token", token);
      return { ok: true, topics: topics.length, coverage };
    } finally {
      await releaseMapJob(service, documentId, token);
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "topic_map_failed";
    console.error("pdf learning v2 failed", { name: message });
    if (message === "topic_map_claim_lost") {
      return { ok: true, pending: true, topics: 0, coverage: null };
    }
    await service
      .from("documents")
      .update({
        topic_map_status: previousMapStatus === "ready" || previousMapStatus === "reviewed"
          ? previousMapStatus
          : "failed",
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

/**
 * Bu belgenin konu düğümleri bir hazırlığa bağlı mı?
 *
 * `exam_prep_topics.document_topic_node_id` silmede NULL olur. Ders,
 * düğüm ilerlemesi ve tanı o kimliğe bakıyor; düğümü silmek hazırlığı
 * bozar. Quiz, kart ve çalışma planı bu tabloya bağlı değil.
 */
/**
 * Harita kullanımda mı?
 *
 * Eski yol yalnız exam_preps.document_id ve document_topic_node_id'ye
 * bakıyordu; source_refs içindeki ikincil belge düğümleri korunmuyordu.
 * source_document_ids ve source_refs.nodeId de "kullanımda" sayılır.
 *
 * Lookup hatası → "kullanımda" (yeniden yazma). Yanlış JSON filtresi
 * yüzünden 500 dönmemeli; kullanılmayan belge de intake/sayfa kırılmamalı.
 */
export async function documentTopicMapIsInUse(
  service: SupabaseClient,
  documentId: string,
  nodeIds: string[],
): Promise<boolean> {
  try {
    const { data: preps, error: prepError } = await service
      .from("exam_preps")
      .select("id")
      .eq("document_id", documentId)
      .limit(1);
    if (prepError) {
      console.error("document_topic_map_in_use_lookup_failed", { stage: "document_id" });
      return true;
    }
    if (preps?.length) return true;

    const { data: sourcePreps, error: sourcePrepError } = await service
      .from("exam_preps")
      .select("id")
      .contains("source_document_ids", [documentId])
      .limit(1);
    if (sourcePrepError) {
      console.error("document_topic_map_in_use_lookup_failed", { stage: "source_document_ids" });
      return true;
    }
    if (sourcePreps?.length) return true;

    if (nodeIds.length) {
      const { data: linked, error: linkError } = await service
        .from("exam_prep_topics")
        .select("id")
        .in("document_topic_node_id", nodeIds)
        .limit(1);
      if (linkError) {
        console.error("document_topic_map_in_use_lookup_failed", { stage: "node_id" });
        return true;
      }
      if (linked?.length) return true;
    }

    // postgrest-js 2.x: jsonb cs filtresi dizi/nesne için JSON string ister;
    // düz nesne `cs.{[object Object]}` üretir ve Postgres reddeder.
    const { data: byDoc, error: byDocError } = await service
      .from("exam_prep_topics")
      .select("id")
      .contains("source_refs", JSON.stringify([{ documentId }]))
      .limit(1);
    if (byDocError) {
      console.error("document_topic_map_in_use_lookup_failed", { stage: "source_refs_doc" });
      return true;
    }
    if (byDoc?.length) return true;

    for (const nodeId of nodeIds) {
      const { data: byNode, error: byNodeError } = await service
        .from("exam_prep_topics")
        .select("id")
        .contains("source_refs", JSON.stringify([{ nodeId }]))
        .limit(1);
      if (byNodeError) {
        console.error("document_topic_map_in_use_lookup_failed", { stage: "source_refs_node" });
        return true;
      }
      if (byNode?.length) return true;
    }
    return false;
  } catch {
    console.error("document_topic_map_in_use_lookup_failed", { stage: "throw" });
    return true;
  }
}

/**
 * Eski kuralda kaydedilmiş şişkin haritayı, belgeyi yeniden modele
 * göndermeden katlar.
 *
 * Aynı dosya ikinci kez yüklenince eski harita kopyalanmıyor; her yükleme
 * yeni bir belge. Burada düzelen şey o belgenin kendi kaydı: kutu ve adım
 * başlıkları hâlâ duruyorsa öğrenciye gösterilmeden önce ait oldukları
 * bölüme katılıyor. Onaylanmış, elle düzenlenmiş ya da bir hazırlıkta
 * kullanılan harita durur. Eski düğümler, yenileri yazılmadan silinmez.
 */
export async function refoldTopicMapIfNeeded(
  service: SupabaseClient,
  documentId: string,
): Promise<boolean> {
  const { data: doc } = await service
    .from("documents")
    .select("topic_map_status, topic_map_updated_at")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc || doc.topic_map_status !== "ready") return false;

  const [{ data: nodes }, { data: linkRows }, { data: pageRows, error: pageError }] =
    await Promise.all([
      service
        .from("document_topic_nodes")
        .select("id, title, learning_objective, prerequisites, is_student_edited, sort_order")
        .eq("document_id", documentId)
        .order("sort_order", { ascending: true }),
      service
        .from("document_topic_page_links")
        .select("topic_id, page_number")
        .eq("document_id", documentId),
      service
        .from("document_pages")
        .select("id, page_number, text_content, headings, page_kind")
        .eq("document_id", documentId)
        .order("page_number", { ascending: true }),
    ]);
  if (pageError) return false;

  const topicRows = nodes ?? [];
  const pages = pageRows ?? [];
  const pagesByTopic = new Map<string, number[]>();
  for (const link of linkRows ?? []) {
    const list = pagesByTopic.get(link.topic_id as string) ?? [];
    list.push(link.page_number as number);
    pagesByTopic.set(link.topic_id as string, list);
  }

  const analyses = pages.map((row) => {
    const pageNumber = row.page_number as number;
    const analyzed = analyzePage(pageNumber, (row.text_content as string | null) ?? "");
    const storedHeadings = Array.isArray(row.headings) ? (row.headings as string[]) : [];
    if (!analyzed.headings.length && storedHeadings.length) {
      return { ...analyzed, headings: storedHeadings };
    }
    return analyzed;
  });
  const content = analyses.filter(
    (page) => page.pageKind === "content" || page.pageKind === "uncertain",
  );
  const foldPages: FoldPage[] = content.map((page) => ({
    pageNumber: page.pageNumber,
    headings: page.headings,
    textContent: page.textContent,
  }));
  const stored = topicRows.map((row) => ({
    title: row.title as string,
    learningObjective: (row.learning_objective as string | null) ?? null,
    pageNumbers: [...new Set(pagesByTopic.get(row.id as string) ?? [])].sort((a, b) => a - b),
    prerequisites: (row.prerequisites as string[] | null) ?? [],
  }));

  const nodeIds = topicRows.map((row) => row.id as string);
  // Lookup hatası → kullanımda say (yeniden yazma); 500 yok.
  const inUse = await documentTopicMapIsInUse(service, documentId, nodeIds).catch(() => true);
  if (
    !shouldRewriteStoredTopicMap({
      status: (doc.topic_map_status as string | null) ?? null,
      studentEdited: topicRows.some((row) => Boolean(row.is_student_edited)),
      inUse,
      topics: stored,
      pages: foldPages,
      pageCount: content.length || pages.length,
    })
  ) {
    return false;
  }

  const consolidated = consolidateTopics(
    stored,
    foldPages,
    content.length || pages.length,
  );
  if (!consolidated.topics.length) return false;

  const linked = completeTopicPageLinks(
    consolidated.topics.map((topic, index) => ({
      ...draftFromLlmTopic(
        topic.title,
        topic.learningObjective,
        topic.pageNumbers,
        analyses,
        index,
      ),
      prerequisites: topic.prerequisites ?? [],
    })),
    analyses,
  );

  const pageIdByNumber = new Map(
    pages.map((row) => [row.page_number as number, row.id as string]),
  );
  const observedAt = (doc.topic_map_updated_at as string | null) ?? null;
  const createdIds: string[] = [];
  const coverage = buildCoverageReport(analyses, linked, consolidated.mergedTitles);

  try {
    const outcome = await replaceTopicNodes(
      {
        claim: async (seenAt) => {
          let query = service
            .from("documents")
            .update({ topic_map_updated_at: new Date().toISOString() })
            .eq("id", documentId)
            .eq("topic_map_status", "ready");
          query = seenAt
            ? query.eq("topic_map_updated_at", seenAt)
            : query.is("topic_map_updated_at", null);
          const { data: claimed, error } = await query.select("id");
          if (error || !claimed?.length) return false;
          // Hak alındıktan sonra hazırlık açıldıysa eski düğümler durur.
          return !(await documentTopicMapIsInUse(service, documentId, nodeIds).catch(() => true));
        },
        insert: async (index) => {
          const topic = linked[index];
          if (!topic) throw new Error("topic_insert_failed");
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
          createdIds.push(data.id as string);
          return data.id as string;
        },
        deleteIds: async (ids) => {
          if (!ids.length) return;
          const { error } = await service
            .from("document_topic_nodes")
            .delete()
            .eq("document_id", documentId)
            .in("id", ids);
          if (error) throw new Error("topic_delete_failed");
        },
        beforeDeleteOld: async () => {
          // Yazma sırasında hazırlık bağlandıysa, bağlandığı düğüm silinmez.
          const { data: preps, error: prepError } = await service
            .from("exam_preps")
            .select("id")
            .eq("document_id", documentId)
            .limit(1);
          if (prepError) throw new Error("prep_lookup_failed");
          const watched = [...nodeIds, ...createdIds];
          const { data: linked, error: linkError } = watched.length
            ? await service
                .from("exam_prep_topics")
                .select("document_topic_node_id")
                .in("document_topic_node_id", watched)
            : { data: [], error: null };
          if (linkError) throw new Error("prep_topic_lookup_failed");
          const referenced = new Set(
            (linked ?? []).map((row) => row.document_topic_node_id as string),
          );
          if (createdIds.some((id) => referenced.has(id))) return "keep";
          if (preps?.length || nodeIds.some((id) => referenced.has(id))) return "rollback";
          return "commit";
        },
      },
      { observedAt, oldIds: nodeIds, count: linked.length },
    );
    if (outcome !== "replaced") return false;
    await persistCoverage(service, documentId, coverage);
    return true;
  } catch {
    // Eski düğümler silinmeden hata olduysa harita duruyor.
    return false;
  }
}

export async function loadTopicMapSnapshot(
  service: SupabaseClient,
  documentId: string,
): Promise<TopicMapSnapshot | null> {
  try {
    await refoldTopicMapIfNeeded(service, documentId);
  } catch (error) {
    console.error("topic_map_refold_skipped", {
      documentId,
      errorType: error instanceof Error ? (error.constructor?.name ?? error.name) : "unknown",
    });
  }
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
