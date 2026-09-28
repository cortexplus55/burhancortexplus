import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  analyzePage,
  type ExtractionMethod,
  type PageAnalysis,
  type PageKind,
} from "@/lib/documents/page-analysis";
import { buildCoverageReport, type CoverageReport } from "@/lib/documents/coverage";
import { draftFromLlmTopic, type TopicDraft } from "@/lib/documents/topic-map";
import { completeTopicPageLinks, pagesForTopicMap } from "@/lib/documents/topic-map-llm";
import {
  shouldRewriteStoredTopicMap,
  consolidateTopics,
  type FoldPage,
} from "@/lib/documents/topic-fold";
import { replaceTopicNodes } from "@/lib/documents/topic-map-refold";
import {
  cleanOcrPageText,
  detectPageFurniture,
  extractTocUnits,
  type FurnitureDetection,
  type OutlineUnitDraft,
} from "@/lib/documents/outline-clean";
import { outlineLeavesFromUnits } from "@/lib/documents/outline-llm";
import { buildOutlineOneShot } from "@/lib/documents/outline-oneshot";
import { packTopicPerspective } from "@/lib/documents/outline-topic-meta";
import { MAP_LEASE_MS } from "@/lib/documents/pdf-learning-v2-lease";
import type { OutlineExamWeight } from "@/lib/documents/outline-clean";

export type MapStage = "prepare" | "oneshot" | "persist" | "windows" | "outline";

export type PdfLearningV2Result = {
  ok: boolean;
  /** Further bounded map windows are pending; caller returns 202 and retries. */
  pending?: boolean;
  topics: number;
  coverage: CoverageReport | null;
  error?: string;
  windowsDone?: number;
  windowsTotal?: number;
  stage?: MapStage;
  leaseBusy?: boolean;
  retryable?: boolean;
};

const MAP_WINDOW_PAGES = 12;
const PAGE_READ_BATCH = 200;
export { MAP_LEASE_MS };
/** Outline oneshot needs its own round budget (≥ call timeout). */
const ROUND_DEADLINE_MS = 250_000;

type MapCheckpointTopic = {
  title: string;
  learningObjective: string | null;
  pageNumbers: number[];
};

type JobMeta = {
  __meta: true;
  phase: MapStage;
  furniture?: FurnitureDetection;
  tocUnits?: { title: string; startPage: number }[];
  windowAttempts?: Record<string, number>;
  outline?: OutlineUnitDraft[];
  /** Raw LLM draft saved between oneshot call and validate/repair rounds. */
  rawDraft?: unknown;
  /** Completed split-part drafts — resume must not restart from zero. */
  partDrafts?: unknown[];
  windowsTotal?: number;
  examLabel?: string | null;
  examDate?: string | null;
};

type MapJob = {
  next_index: number;
  topics: unknown[];
  lease_token: string | null;
};

function isJobMeta(value: unknown): value is JobMeta {
  return Boolean(value) && typeof value === "object" && (value as JobMeta).__meta === true;
}

function splitJobTopics(raw: unknown[]): {
  meta: JobMeta | null;
  compact: MapCheckpointTopic[];
} {
  let meta: JobMeta | null = null;
  const compact: MapCheckpointTopic[] = [];
  for (const item of raw) {
    if (isJobMeta(item)) {
      meta = item;
      continue;
    }
    if (
      item &&
      typeof item === "object" &&
      typeof (item as MapCheckpointTopic).title === "string"
    ) {
      const row = item as MapCheckpointTopic;
      compact.push({
        title: row.title,
        learningObjective: row.learningObjective ?? null,
        pageNumbers: Array.isArray(row.pageNumbers) ? row.pageNumbers : [],
      });
    }
  }
  return { meta, compact };
}

function packJobTopics(meta: JobMeta, compact: MapCheckpointTopic[]): unknown[] {
  return [meta, ...compact];
}

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
    topics: Array.isArray(data.topics) ? data.topics as unknown[] : [],
    lease_token: data.lease_token as string,
  } : null;
}

async function readMapJobProgress(
  service: SupabaseClient,
  documentId: string,
): Promise<{ windowsDone: number; windowsTotal: number; stage: MapStage } | null> {
  const { data } = await service.from("document_topic_map_jobs")
    .select("next_index, topics")
    .eq("document_id", documentId)
    .maybeSingle();
  if (!data) return null;
  const { meta, compact } = splitJobTopics(Array.isArray(data.topics) ? data.topics as unknown[] : []);
  const windowsTotal = meta?.windowsTotal ?? 0;
  const stage = meta?.phase ?? (data.next_index === 0 ? "prepare" : "windows");
  return {
    windowsDone: Number(data.next_index) || 0,
    windowsTotal: windowsTotal || Math.max(compact.length ? 1 : 0, Number(data.next_index) || 0),
    stage,
  };
}

async function releaseMapJob(service: SupabaseClient, documentId: string, token: string) {
  await service.from("document_topic_map_jobs")
    .update({ lease_token: null, lease_until: null, updated_at: new Date().toISOString() })
    .eq("document_id", documentId)
    .eq("lease_token", token);
}

/** Keep the map lease alive while a long outline call runs. */
async function renewMapLease(
  service: SupabaseClient,
  documentId: string,
  token: string,
): Promise<void> {
  const now = new Date();
  await service
    .from("document_topic_map_jobs")
    .update({
      lease_until: new Date(now.getTime() + MAP_LEASE_MS).toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("document_id", documentId)
    .eq("lease_token", token);
}

async function clearTopicMap(service: SupabaseClient, documentId: string) {
  await service.from("document_topic_nodes").delete().eq("document_id", documentId);
  await service.from("document_coverage_reports").delete().eq("document_id", documentId);
}

type LightPageRow = {
  id: string;
  page_number: number;
  page_kind: string | null;
  char_count: number | null;
  headings: unknown;
  extraction_ok: boolean | null;
  extraction_method: string | null;
  text_content?: string | null;
};

async function loadPageLight(service: SupabaseClient, documentId: string): Promise<LightPageRow[]> {
  const rows: LightPageRow[] = [];
  for (let offset = 0; ; offset += PAGE_READ_BATCH) {
    const { data, error } = await service.from("document_pages")
      .select("id, page_number, page_kind, char_count, headings, extraction_ok, extraction_method")
      .eq("document_id", documentId)
      .order("page_number", { ascending: true })
      .range(offset, offset + PAGE_READ_BATCH - 1);
    if (error) throw new Error("page_load_failed");
    rows.push(...((data ?? []) as LightPageRow[]));
    if ((data ?? []).length < PAGE_READ_BATCH) break;
  }
  return rows;
}

async function loadPageTexts(
  service: SupabaseClient,
  documentId: string,
  pageNumbers: number[],
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (!pageNumbers.length) return out;
  const unique = [...new Set(pageNumbers)];
  for (let offset = 0; offset < unique.length; offset += 40) {
    const chunk = unique.slice(offset, offset + 40);
    const { data, error } = await service.from("document_pages")
      .select("page_number, text_content")
      .eq("document_id", documentId)
      .in("page_number", chunk);
    if (error) throw new Error("page_load_failed");
    for (const row of data ?? []) {
      out.set(
        row.page_number as number,
        cleanOcrPageText((row.text_content as string | null) ?? ""),
      );
    }
  }
  return out;
}

/**
 * Rebuild PageAnalysis from prepare-persisted metadata — no text_content.
 * Windows/outline/persist rounds must not re-read full document text (S3).
 */
function analysesFromLight(rows: LightPageRow[]): PageAnalysis[] {
  return rows.map((row) => {
    const pageKind = (row.page_kind as PageKind | null) ?? "content";
    const method = (row.extraction_method as ExtractionMethod | null) ?? "none";
    const headings = Array.isArray(row.headings) ? (row.headings as string[]) : [];
    return {
      pageNumber: row.page_number,
      textContent: "",
      extractionOk: row.extraction_ok !== false,
      pageKind,
      headings,
      formulas: [],
      tablesDetected: 0,
      imagesDetected: 0,
      uncertainRegions: [],
      extractionMethod: method,
      charCount: typeof row.char_count === "number" ? row.char_count : 0,
    };
  });
}

async function persistPageMeta(
  service: SupabaseClient,
  pageId: string,
  analysis: PageAnalysis,
  preserveMethod?: string | null,
) {
  const method =
    preserveMethod === "ocr" ||
    preserveMethod === "visual" ||
    preserveMethod === "manual"
      ? preserveMethod
      : analysis.extractionMethod;
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
      extraction_method: method,
      char_count: analysis.charCount,
    })
    .eq("id", pageId);
  if (error) throw new Error("page_meta_update_failed");
}

export type HierarchicalTopic = TopicDraft & {
  unitTitle?: string | null;
  examWeight?: OutlineExamWeight | null;
  unitExamWeight?: OutlineExamWeight | null;
  likelyAsked?: string[];
  whyLearn?: string | null;
};

async function persistTopics(
  service: SupabaseClient,
  documentId: string,
  topics: HierarchicalTopic[],
  pageIdByNumber: Map<number, string>,
  units?: { title: string; topicIndexes: number[]; examWeight?: OutlineExamWeight }[],
) {
  const topicIdByMergeKey = new Map<string, string>();
  if (!topics.length) return topicIdByMergeKey;

  // Insert unit nodes first (parent_id null), then leaf topics.
  // Match parents by unit index — duplicate titles must not collide.
  const unitIdByIndex = new Map<number, string>();
  if (units?.length) {
    const { data: unitRows, error: unitError } = await service
      .from("document_topic_nodes")
      .insert(
        units.map((unit, index) => {
          const packed = packTopicPerspective({
            examWeight: unit.examWeight ?? "medium",
          });
          return {
            document_id: documentId,
            parent_id: null,
            sort_order: index,
            title: unit.title,
            learning_objective: packed.learning_objective,
            prerequisites: packed.prerequisites,
            key_definitions: packed.key_definitions,
            key_relations: packed.key_relations,
            worked_examples: [],
            common_mistakes: [],
            source_exercises: [],
          };
        }),
      )
      .select("id, title, sort_order");
    if (unitError || !unitRows?.length) throw new Error("topic_insert_failed");
    for (const row of unitRows) {
      unitIdByIndex.set(row.sort_order as number, row.id as string);
    }
  }

  const topicUnitIndex = new Map<number, number>();
  if (units?.length) {
    units.forEach((unit, unitIndex) => {
      for (const topicIndex of unit.topicIndexes) {
        if (!topicUnitIndex.has(topicIndex)) topicUnitIndex.set(topicIndex, unitIndex);
      }
    });
  }

  const unitOffset = units?.length ?? 0;
  const { data: saved, error: topicError } = await service
    .from("document_topic_nodes")
    .insert(
      topics.map((topic, index) => {
        const unitIndex = topicUnitIndex.get(index);
        const parentId =
          unitIndex !== undefined ? (unitIdByIndex.get(unitIndex) ?? null) : null;
        const packed = packTopicPerspective({
          examWeight: topic.examWeight ?? topic.unitExamWeight ?? "medium",
          likelyAsked: topic.likelyAsked?.length ? topic.likelyAsked : topic.keyDefinitions,
          whyLearn: topic.whyLearn ?? topic.learningObjective,
          prerequisiteTitles: topic.prerequisites,
        });
        return {
          document_id: documentId,
          parent_id: parentId,
          sort_order: unitOffset + index,
          title: topic.title,
          learning_objective: packed.learning_objective ?? topic.learningObjective,
          prerequisites: packed.prerequisites.length
            ? packed.prerequisites
            : topic.prerequisites,
          key_definitions: packed.key_definitions.length
            ? packed.key_definitions
            : topic.keyDefinitions,
          key_relations: packed.key_relations.length
            ? packed.key_relations
            : topic.keyRelations,
          worked_examples: topic.workedExamples,
          common_mistakes: topic.commonMistakes,
          source_exercises: topic.sourceExercises,
        };
      }),
    )
    .select("id, sort_order");
  if (topicError || !saved || saved.length !== topics.length) throw new Error("topic_insert_failed");
  const idByOrder = new Map(saved.map((row) => [row.sort_order as number, row.id as string]));
  const links: {
    document_id: string; topic_id: string; page_id: string;
    page_number: number; relevance: "primary";
  }[] = [];
  for (const [index, topic] of topics.entries()) {
    const id = idByOrder.get(unitOffset + index);
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

function isRetryableMapError(message: string): boolean {
  if (message === "topic_map_no_readable_pages") return false;
  if (message === "topic_map_in_use") return false;
  if (/timeout|ECONNRESET|429|5\d\d|rate.?limit|overloaded|fetch failed|deadline|claim/i.test(message)) {
    return true;
  }
  // LLM / transient map problems stay retryable after OCR succeeded.
  return (
    message === "topic_map_failed" ||
    message === "topic_map_unavailable" ||
    message === "topic_map_job_claim_failed" ||
    message === "topic_map_job_insert_failed" ||
    message === "page_load_failed" ||
    message === "page_meta_update_failed"
  );
}

/**
 * After classic RAG page/chunk insert, enrich pages + build topic map + coverage.
 * Bounded rounds: prepare → windows → outline → persist (each POST ≤ ~60s).
 */
export async function runPdfLearningV2(
  service: SupabaseClient,
  documentId: string,
  options?: { examLabel?: string | null; examDate?: string | null },
): Promise<PdfLearningV2Result> {
  let previousMapStatus: string | null = null;
  const roundStarted = Date.now();
  const deadlineAt = roundStarted + ROUND_DEADLINE_MS;
  try {
    const { data: docRow, error: docLoadError } = await service
      .from("documents")
      .select("user_id, file_name, mime_type, topic_map_status")
      .eq("id", documentId)
      .is("deleted_at", null)
      .maybeSingle();
    if (docLoadError || !docRow?.user_id) throw new Error("document_not_found");
    previousMapStatus = docRow.topic_map_status as string | null;

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

    const job = await claimMapJob(service, documentId);
    if (!job) {
      const progress = await readMapJobProgress(service, documentId);
      return {
        ok: true,
        pending: true,
        topics: 0,
        coverage: null,
        leaseBusy: true,
        windowsDone: progress?.windowsDone ?? 0,
        windowsTotal: progress?.windowsTotal ?? 0,
        stage: progress?.stage ?? "windows",
      };
    }
    const token = job.lease_token!;
    try {
      let { meta } = splitJobTopics(job.topics);
      const phase: MapStage = meta?.phase ?? "prepare";

      // ——— PREPARE: light columns + analyze + persist meta + furniture ———
      if (phase === "prepare") {
        const light = await loadPageLight(service, documentId);
        if (!light.length) throw new Error("topic_map_no_readable_pages");
        const texts = await loadPageTexts(
          service,
          documentId,
          light.map((r) => r.page_number),
        );
        const analyses: PageAnalysis[] = [];
        for (const row of light) {
          const text = texts.get(row.page_number) ?? "";
          const analysis = analyzePage(row.page_number, text, row.extraction_method);
          if (row.extraction_ok === false) {
            analysis.extractionOk = false;
            if (analysis.pageKind === "content" || analysis.pageKind === "uncertain") {
              analysis.pageKind = "unreadable";
            }
          }
          if (row.page_kind === "blank") analysis.pageKind = "blank";
          analyses.push(analysis);
        }
        for (let offset = 0; offset < analyses.length; offset += 8) {
          await Promise.all(analyses.slice(offset, offset + 8).map(async (analysis) => {
            const row = light.find((r) => r.page_number === analysis.pageNumber);
            if (row) await persistPageMeta(service, row.id, analysis, row.extraction_method);
          }));
        }
        const furniture = detectPageFurniture(
          analyses.map((a) => ({
            pageNumber: a.pageNumber,
            text: a.textContent,
            pageKind: a.pageKind,
          })),
        );
        const tocUnits = extractTocUnits(
          analyses.map((a) => ({
            pageNumber: a.pageNumber,
            text: a.textContent,
            pageKind: a.pageKind,
            headings: a.headings,
          })),
        );
        const mapPages = pagesForTopicMap(analyses);
        if (!mapPages.length) throw new Error("topic_map_no_readable_pages");
        meta = {
          __meta: true,
          phase: "oneshot",
          furniture,
          tocUnits: tocUnits.length ? tocUnits : undefined,
          windowsTotal: 1,
          examLabel: options?.examLabel ?? null,
          examDate: options?.examDate ?? null,
        };
        const nowIso = new Date().toISOString();
        const { data: saved, error: checkpointError } = await service
          .from("document_topic_map_jobs")
          .update({
            next_index: 0,
            topics: packJobTopics(meta, []),
            updated_at: nowIso,
          })
          .eq("document_id", documentId)
          .eq("lease_token", token)
          .select("document_id");
        if (checkpointError || !saved?.length) throw new Error("topic_map_claim_lost");
        console.info("pdf-learning-v2 round", {
          documentId,
          stage: "prepare",
          ms: Date.now() - roundStarted,
        });
        return {
          ok: true,
          pending: true,
          topics: 0,
          coverage: null,
          windowsDone: 0,
          windowsTotal: 1,
          stage: "prepare",
        };
      }

      // ——— ONESHOT: load full text once + one (or split/merge) LLM outline ———
      const light = await loadPageLight(service, documentId);
      const pageIdByNumber = new Map(
        light.map((row) => [row.page_number as number, row.id as string]),
      );
      if (!meta) {
        meta = { __meta: true, phase: "oneshot", windowsTotal: 1 };
      }

      // Legacy jobs that still say windows/outline jump to oneshot.
      const needsOneshot =
        meta.phase === "oneshot" ||
        meta.phase === "windows" ||
        meta.phase === "outline" ||
        !meta.outline;

      if (needsOneshot && !meta.outline) {
        const texts = await loadPageTexts(
          service,
          documentId,
          light.map((r) => r.page_number),
        );
        const analyses: PageAnalysis[] = light.map((row) => {
          const base = analysesFromLight([row])[0]!;
          return { ...base, textContent: texts.get(row.page_number) ?? "" };
        });
        const mapPages = pagesForTopicMap(analyses);
        if (!mapPages.length) throw new Error("topic_map_no_readable_pages");

        const tocFromMeta = meta.tocUnits?.length
          ? meta.tocUnits.map((u) => `- ${u.title} (s.${u.startPage})`).join("\n")
          : "";
        const tocFromPages = analyses
          .filter((p) => p.pageKind === "toc")
          .map((p) => p.textContent.slice(0, 1200))
          .filter(Boolean)
          .join("\n")
          .slice(0, 4000);
        const tocBlock = tocFromMeta || tocFromPages || null;

        const corpusPages = mapPages.map((p) => ({
          pageNumber: p.pageNumber,
          text:
            p.pageKind === "toc"
              ? `İÇİNDEKİLER\n${p.textContent}`
              : p.textContent,
        }));

        const heartbeat = setInterval(() => {
          void renewMapLease(service, documentId, token);
        }, Math.max(30_000, Math.floor(MAP_LEASE_MS / 3)));

        let checkpointWrite: Promise<void> = Promise.resolve();
        let lastCheckpointAt = 0;
        const persistCheckpoint = (state: {
          rawDraft?: unknown;
          partDrafts?: unknown[];
        }) => {
          const nowMs = Date.now();
          // Throttle DB writes while the stream is hot; always keep latest.
          if (nowMs - lastCheckpointAt < 4_000) return;
          lastCheckpointAt = nowMs;
          meta = {
            ...meta!,
            phase: "oneshot",
            rawDraft: state.rawDraft ?? meta?.rawDraft,
            partDrafts: state.partDrafts ?? meta?.partDrafts,
          };
          checkpointWrite = (async () => {
            await service
              .from("document_topic_map_jobs")
              .update({
                topics: packJobTopics(meta!, []),
                updated_at: new Date().toISOString(),
              })
              .eq("document_id", documentId)
              .eq("lease_token", token);
          })();
        };

        const outlineStarted = Date.now();
        let outlineResult;
        try {
          outlineResult = await buildOutlineOneShot({
            service,
            userId: docRow.user_id as string,
            files: [
              {
                fileName: (docRow.file_name as string) ?? "belge",
                pages: corpusPages,
              },
            ],
            pagesForFallback: mapPages,
            examLabel: options?.examLabel ?? meta.examLabel ?? null,
            examDate: options?.examDate ?? meta.examDate ?? null,
            deadlineAt,
            allowModel: true,
            tocBlock: tocBlock ?? undefined,
            resumeDraft: meta.rawDraft,
            resumePartDrafts: Array.isArray(meta.partDrafts)
              ? (meta.partDrafts as never[])
              : undefined,
            onCheckpoint: persistCheckpoint,
          });
          await checkpointWrite;
        } finally {
          clearInterval(heartbeat);
        }
        console.info("pipeline_timing", {
          documentId,
          stage: "outline",
          ms: Date.now() - outlineStarted,
          pages: mapPages.length,
          model: outlineResult.model ?? null,
          path: outlineResult.path,
          units: outlineResult.units.length,
          topics: outlineResult.units.reduce((n, u) => n + u.topics.length, 0),
          retryable: outlineResult.retryable,
        });
        // Keep partial progress even on failure — next round resumes, never zero.
        if (outlineResult.rawDraft != null || outlineResult.partDrafts?.length) {
          meta = {
            ...meta,
            phase: "oneshot",
            rawDraft: outlineResult.rawDraft ?? meta.rawDraft,
            partDrafts: outlineResult.partDrafts ?? meta.partDrafts,
          };
          await service
            .from("document_topic_map_jobs")
            .update({
              topics: packJobTopics(meta, []),
              updated_at: new Date().toISOString(),
            })
            .eq("document_id", documentId)
            .eq("lease_token", token);
        }

        // No fabricated heading soup — student gets a clear retry state.
        if (!outlineResult.fromModel || !outlineResult.units.length) {
          throw new Error("topic_map_unavailable");
        }

        meta = {
          ...meta,
          phase: "persist",
          outline: outlineResult.units,
          rawDraft: undefined,
          partDrafts: undefined,
          windowsTotal: 1,
        };
        const nowIso = new Date().toISOString();
        const { data: saved, error: checkpointError } = await service
          .from("document_topic_map_jobs")
          .update({
            next_index: 1,
            topics: packJobTopics(meta, []),
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
        console.info("pdf-learning-v2 round", {
          documentId,
          stage: "oneshot",
          fromModel: outlineResult.fromModel,
          path: outlineResult.path,
          ms: Date.now() - roundStarted,
        });
        return {
          ok: true,
          pending: true,
          topics: outlineLeavesFromUnits(outlineResult.units).leafTopics.length,
          coverage: null,
          windowsDone: 1,
          windowsTotal: 1,
          stage: "oneshot",
        };
      }

      // ——— PERSIST: hierarchy + coverage (metadata only; outline already decided) ———
      const analyses = analysesFromLight(light);
      const mapPages = pagesForTopicMap(analyses);
      if (!mapPages.length) throw new Error("topic_map_no_readable_pages");
      const outline = meta.outline;
      if (!outline?.length) throw new Error("topic_map_unavailable");
      const { units, leafTopics } = outlineLeavesFromUnits(outline);
      if (!leafTopics.length) throw new Error("topic_map_unavailable");

      const hierarchical: HierarchicalTopic[] = leafTopics.map((leaf, index) => {
        const why = leaf.whyLearn ?? leaf.description ?? null;
        const draft = draftFromLlmTopic(leaf.title, why, leaf.pageNumbers, analyses, index);
        return {
          ...draft,
          learningObjective: why,
          prerequisites: leaf.prerequisiteTitles ?? [],
          keyDefinitions: leaf.likelyAsked ?? draft.keyDefinitions,
          unitTitle: leaf.unitTitle,
          examWeight: leaf.examWeight ?? null,
          unitExamWeight: leaf.unitExamWeight ?? null,
          likelyAsked: leaf.likelyAsked ?? [],
          whyLearn: why,
        };
      });
      const linked = completeTopicPageLinks(hierarchical, analyses);
      const withUnits: HierarchicalTopic[] = leafTopics.map((leaf, index) => {
        const match =
          linked.find(
            (t) =>
              t.title === leaf.title &&
              t.pageNumbers[0] === leaf.pageNumbers[0],
          ) ??
          linked[index] ??
          hierarchical[index]!;
        const prior = match as HierarchicalTopic;
        return {
          ...prior,
          unitTitle: leaf.unitTitle,
          examWeight: leaf.examWeight ?? prior.examWeight,
          unitExamWeight: leaf.unitExamWeight ?? prior.unitExamWeight,
          likelyAsked: leaf.likelyAsked ?? prior.likelyAsked,
          whyLearn: leaf.whyLearn ?? leaf.description ?? prior.whyLearn,
          prerequisites: leaf.prerequisiteTitles?.length
            ? leaf.prerequisiteTitles
            : prior.prerequisites,
        };
      });
      // Re-check in-use before wipe — race if a prep linked the map mid-round.
      const existingIds = (
        await service
          .from("document_topic_nodes")
          .select("id")
          .eq("document_id", documentId)
      ).data?.map((r) => r.id as string) ?? [];
      if (
        existingIds.length &&
        (await documentTopicMapIsInUse(service, documentId, existingIds).catch(() => true))
      ) {
        throw new Error("topic_map_in_use");
      }
      await clearTopicMap(service, documentId);
      // Index-based unit wiring — walk leaves in outline order; never match by
      // title alone (duplicate unit titles would collide).
      let leafCursor = 0;
      const unitsByIndex = units.map((u) => {
        const count = u.topics.length;
        const topicIndexes = Array.from({ length: count }, (_, i) => leafCursor + i);
        leafCursor += count;
        return {
          title: u.title,
          examWeight: u.examWeight,
          topicIndexes: topicIndexes.filter((i) => i < leafTopics.length),
        };
      });
      await persistTopics(
        service,
        documentId,
        withUnits,
        pageIdByNumber,
        unitsByIndex,
      );
      const coverage = buildCoverageReport(analyses, withUnits, []);
      const topicCount = withUnits.length;
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
      console.info("pdf-learning-v2 round", {
        documentId,
        stage: "persist",
        topics: topicCount,
        ms: Date.now() - roundStarted,
      });
      return { ok: true, topics: topicCount, coverage, stage: "persist" };
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
    const retryable = isRetryableMapError(message);
    if (!retryable) {
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
    }
    return { ok: false, topics: 0, coverage: null, error: message, retryable };
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

/**
 * Unused flat maps (e.g. founder’s 111 junk topics) must be rebuilt with the
 * one-shot outline. Hierarchical maps and maps already tied to an exam stay.
 */
export function flatMapNeedsOneshotRegen(input: {
  status: string | null;
  inUse: boolean;
  nodes: { parent_id: string | null; is_student_edited?: boolean | null }[];
}): boolean {
  if (input.status !== "ready" && input.status !== "reviewed") return false;
  if (input.inUse) return false;
  if (input.nodes.some((n) => n.is_student_edited === true)) return false;
  if (!input.nodes.length) return true;
  if (input.nodes.some((n) => n.parent_id != null)) return false;
  // Short flat maps can be legitimate single-level outlines.
  return input.nodes.length > 16;
}

export async function unusedFlatMapNeedsOneshot(
  service: SupabaseClient,
  documentId: string,
): Promise<boolean> {
  const { data: doc } = await service
    .from("documents")
    .select("topic_map_status")
    .eq("id", documentId)
    .is("deleted_at", null)
    .maybeSingle();
  const status = (doc?.topic_map_status as string | null) ?? null;

  const { data: nodes, error } = await service
    .from("document_topic_nodes")
    .select("id, parent_id, is_student_edited")
    .eq("document_id", documentId);
  if (error) return false;
  const rows = nodes ?? [];
  const inUse = rows.length
    ? await documentTopicMapIsInUse(
        service,
        documentId,
        rows.map((r) => r.id as string),
      ).catch(() => true)
    : false;
  return flatMapNeedsOneshotRegen({
    status,
    inUse,
    nodes: rows.map((r) => ({
      parent_id: (r.parent_id as string | null) ?? null,
      is_student_edited: (r.is_student_edited as boolean | null) ?? null,
    })),
  });
}

/**
 * Clear an unused flat map and start oneshot regeneration.
 * Returns whether the caller should wait (map pending).
 */
export async function regenerateUnusedFlatTopicMap(
  service: SupabaseClient,
  documentId: string,
  options?: { examLabel?: string | null; examDate?: string | null },
): Promise<{ regenerating: boolean }> {
  const needs = await unusedFlatMapNeedsOneshot(service, documentId);
  if (!needs) return { regenerating: false };

  // Keep the old map until the new one is ready — mark pending without wipe.
  // Persist round clears+swaps only after a successful oneshot.
  await service.from("document_topic_map_jobs").delete().eq("document_id", documentId);
  const { error } = await service
    .from("documents")
    .update({
      topic_map_status: "pending",
      topic_map_error: null,
      topic_map_updated_at: new Date().toISOString(),
    })
    .eq("id", documentId);
  if (error) return { regenerating: false };

  // Kick one map round so the wizard's follow-up process poll has a head start.
  const result = await runPdfLearningV2(service, documentId, options);
  if (result.ok && !result.pending && result.topics > 0) {
    return { regenerating: false };
  }
  return { regenerating: true };
}

/**
 * One oneshot call over ALL course documents. Persists topics per fileIndex
 * onto each document. Used by multi-file intake so consolidate never runs.
 */
export async function runCourseOutlineOneShot(
  service: SupabaseClient,
  userId: string,
  documentIds: string[],
  options?: { examLabel?: string | null; examDate?: string | null },
): Promise<{ ok: boolean; units: number; topics: number; model?: string }> {
  if (documentIds.length < 2) {
    return { ok: false, units: 0, topics: 0 };
  }
  const files: { documentId: string; fileName: string; pages: { pageNumber: number; text: string }[] }[] = [];
  const previousParts: OutlineUnitDraft[] = [];

  for (const documentId of documentIds) {
    const inUseIds = (
      await service.from("document_topic_nodes").select("id").eq("document_id", documentId)
    ).data?.map((r) => r.id as string) ?? [];
    if (
      inUseIds.length &&
      (await documentTopicMapIsInUse(service, documentId, inUseIds).catch(() => true))
    ) {
      return { ok: false, units: 0, topics: 0 };
    }
    const { data: doc } = await service
      .from("documents")
      .select("file_name, status")
      .eq("id", documentId)
      .maybeSingle();
    if (!doc || doc.status !== "completed") {
      return { ok: false, units: 0, topics: 0 };
    }
    const light = await loadPageLight(service, documentId);
    const texts = await loadPageTexts(
      service,
      documentId,
      light.map((r) => r.page_number),
    );
    const analyses: PageAnalysis[] = light.map((row) => {
      const base = analysesFromLight([row])[0]!;
      return { ...base, textContent: texts.get(row.page_number) ?? "" };
    });
    const mapPages = pagesForTopicMap(analyses);
    if (!mapPages.length) return { ok: false, units: 0, topics: 0 };
    files.push({
      documentId,
      fileName: (doc.file_name as string) ?? "belge",
      pages: mapPages.map((p) => ({
        pageNumber: p.pageNumber,
        text: p.pageKind === "toc" ? `İÇİNDEKİLER\n${p.textContent}` : p.textContent,
      })),
    });

    // Prior hierarchical outline for extend/merge prompt.
    const { data: priorNodes } = await service
      .from("document_topic_nodes")
      .select("id, title, parent_id, sort_order, learning_objective, key_definitions, key_relations, prerequisites")
      .eq("document_id", documentId)
      .order("sort_order");
    if (priorNodes?.some((n) => n.parent_id != null)) {
      const parents = priorNodes.filter((n) =>
        priorNodes.some((c) => c.parent_id === n.id),
      );
      for (const parent of parents) {
        const children = priorNodes.filter((c) => c.parent_id === parent.id);
        previousParts.push({
          title: String(parent.title ?? ""),
          topics: children.map((c) => ({
            title: String(c.title ?? ""),
            sourceTitles: [String(c.title ?? "")],
            pageNumbers: [],
            whyLearn: (c.learning_objective as string | null) ?? undefined,
          })),
        });
      }
    }
  }

  const started = Date.now();
  const result = await buildOutlineOneShot({
    service,
    userId,
    files: files.map((f) => ({ fileName: f.fileName, pages: f.pages })),
    examLabel: options?.examLabel ?? null,
    examDate: options?.examDate ?? null,
    allowModel: true,
    previousOutline: previousParts.length ? previousParts : undefined,
  });
  console.info("pipeline_timing", {
    documentId: documentIds.join(","),
    stage: "outline_course",
    ms: Date.now() - started,
    pages: files.reduce((n, f) => n + f.pages.length, 0),
    model: result.model ?? null,
    path: result.path,
    units: result.units.length,
  });
  if (!result.fromModel || !result.units.length) {
    return { ok: false, units: 0, topics: 0, model: result.model };
  }

  // Persist each file's topics onto its document (fileIndex → documentIds).
  for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
    const file = files[fileIndex]!;
    const fileUnits = result.units
      .map((unit) => ({
        ...unit,
        topics: unit.topics.filter((t) => (t.fileIndex ?? 0) === fileIndex),
      }))
      .filter((u) => u.topics.length > 0);
    if (!fileUnits.length) continue;

    const light = await loadPageLight(service, file.documentId);
    const pageIdByNumber = new Map(
      light.map((row) => [row.page_number as number, row.id as string]),
    );
    const analyses = analysesFromLight(light);
    const { units, leafTopics } = outlineLeavesFromUnits(fileUnits);
    if (!leafTopics.length) continue;

    const hierarchical: HierarchicalTopic[] = leafTopics.map((leaf, index) => {
      const why = leaf.whyLearn ?? leaf.description ?? null;
      const draft = draftFromLlmTopic(leaf.title, why, leaf.pageNumbers, analyses, index);
      return {
        ...draft,
        learningObjective: why,
        prerequisites: leaf.prerequisiteTitles ?? [],
        keyDefinitions: leaf.likelyAsked ?? draft.keyDefinitions,
        unitTitle: leaf.unitTitle,
        examWeight: leaf.examWeight ?? null,
        unitExamWeight: leaf.unitExamWeight ?? null,
        likelyAsked: leaf.likelyAsked ?? [],
        whyLearn: why,
      };
    });
    const linked = completeTopicPageLinks(hierarchical, analyses);
    const withUnits: HierarchicalTopic[] = leafTopics.map((leaf, index) => {
      const match =
        linked.find(
          (t) => t.title === leaf.title && t.pageNumbers[0] === leaf.pageNumbers[0],
        ) ??
        linked[index] ??
        hierarchical[index]!;
      const prior = match as HierarchicalTopic;
      return {
        ...prior,
        unitTitle: leaf.unitTitle,
        examWeight: leaf.examWeight ?? prior.examWeight,
        unitExamWeight: leaf.unitExamWeight ?? prior.unitExamWeight,
        likelyAsked: leaf.likelyAsked ?? prior.likelyAsked,
        whyLearn: leaf.whyLearn ?? leaf.description ?? prior.whyLearn,
        prerequisites: leaf.prerequisiteTitles?.length
          ? leaf.prerequisiteTitles
          : prior.prerequisites,
      };
    });

    await clearTopicMap(service, file.documentId);
    let leafCursor = 0;
    const unitsByIndex = units.map((u) => {
      const count = u.topics.length;
      const topicIndexes = Array.from({ length: count }, (_, i) => leafCursor + i);
      leafCursor += count;
      return {
        title: u.title,
        examWeight: u.examWeight,
        topicIndexes: topicIndexes.filter((i) => i < leafTopics.length),
      };
    });
    await persistTopics(service, file.documentId, withUnits, pageIdByNumber, unitsByIndex);
    await service
      .from("documents")
      .update({
        topic_map_status: "ready",
        topic_map_error: null,
        topic_map_updated_at: new Date().toISOString(),
        status: "completed",
      })
      .eq("id", file.documentId);
  }

  return {
    ok: true,
    units: result.units.length,
    topics: result.units.reduce((n, u) => n + u.topics.length, 0),
    model: result.model,
  };
}

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
