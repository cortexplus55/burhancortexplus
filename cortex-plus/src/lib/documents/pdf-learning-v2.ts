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
  flattenOutlineUnits,
  type OutlineUnitDraft,
} from "@/lib/documents/outline-clean";
import {
  prepareOutlineMaterial,
  runOutlineStep,
  type MaterialFileCorpus,
  type OutlineProgress,
  type OutlineStepResult,
  type OutlineStage,
} from "@/lib/documents/outline-oneshot";
import {
  packCourseRelation,
  packTopicPerspective,
  readCourseFromRelations,
} from "@/lib/documents/outline-topic-meta";
import { commitCredits, refundCredits } from "@/lib/credits/service";
import { MAP_LEASE_MS } from "@/lib/documents/pdf-learning-v2-lease";
import { exclusivePageRanges } from "@/lib/documents/topic-page-ranges";
import { needsUnits, type ConceptUnit } from "@/lib/documents/concept-units";
import { buildConceptUnits } from "@/lib/documents/concept-units-run";
import { repeatedEdgeLines } from "@/lib/documents/clean-text";

export type CourseMapStage = "prepare" | OutlineStage | "persist";

export type CourseMapResult = {
  ok: boolean;
  /** More rounds needed; the caller returns 202 and the client polls again. */
  pending?: boolean;
  leaseBusy?: boolean;
  stage?: CourseMapStage;
  /** Rounds run so far — moves the client's progress fingerprint. */
  round?: number;
  topics: number;
  error?: string;
  retryable?: boolean;
  /** Waiting for the wizard's course outline — no model call was made. */
  deferred?: boolean;
};

const PAGE_READ_BATCH = 200;
export { MAP_LEASE_MS };
/** A round must finish well inside the 300 s function ceiling. */
export const COURSE_ROUND_BUDGET_MS = 270_000;
/** Time kept back after a model call for validation, checkpoint and persist. */
const POST_CALL_RESERVE_MS = 12_000;
const PERSIST_RESERVE_MS = 25_000;
/** Failed outline attempts (provider errors, aborts) before giving up. */
const MAX_OUTLINE_FAILURES = 4;
/**
 * Hard cap on outline call stages per attempt (first, escalate, repair,
 * fallback, retries). The parallel parts of a huge corpus are one stage.
 */
export const MAX_OUTLINE_CALLS = 6;
/** A wizard deferral or course job untouched this long is abandoned. */
export const COURSE_WAIT_STALE_MS = 30 * 60_000;

type CourseOutline = {
  units: OutlineUnitDraft[];
  model: string;
  path: string;
  dropped: number;
  reservationIds: string[];
};

type CourseMeta = {
  __meta: true;
  phase: "course";
  courseDocumentIds: string[];
  /** Part of every outline credit key; renewed whenever a call settles. */
  attemptId: string;
  stage: CourseMapStage;
  rounds: number;
  failures: number;
  /** Outline call stages started in this attempt (see MAX_OUTLINE_CALLS). */
  calls?: number;
  /** Last checkpoint — tells a live course from an abandoned one. */
  touchedAt?: string;
  /** Keys of calls in flight — a killed round leaves them for the next one. */
  inflight?: string[];
  progress?: OutlineProgress;
  outline?: CourseOutline;
  previousStatus?: Record<string, string | null>;
  examLabel?: string | null;
  examDate?: string | null;
  prepId?: string | null;
};

type MapJob = { topics: unknown[]; lease_token: string };

function readCourseMeta(raw: unknown[]): CourseMeta | null {
  const first = raw[0] as CourseMeta | undefined;
  return first && first.__meta === true && first.phase === "course" ? first : null;
}

/**
 * "This file waits for a course outline" — kept in the file's own job row
 * (existing columns only). No courseId: the wizard extracted it and will
 * start the course later. courseId: that course's outline covers it.
 */
type WaitMarker = { __meta: true; phase: "deferred"; at: string; courseId?: string };

function readWaitMarker(raw: unknown): WaitMarker | null {
  const first = (Array.isArray(raw) ? raw[0] : null) as WaitMarker | null;
  return first && first.__meta === true && first.phase === "deferred" ? first : null;
}

function isFresh(iso: string | undefined | null, nowMs: number): boolean {
  const at = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(at) && nowMs - at < COURSE_WAIT_STALE_MS;
}

/** Record that this file's map waits for a course outline. Never overwrites a course job. */
export async function markMapDeferred(service: SupabaseClient, documentId: string, courseId?: string) {
  const marker: WaitMarker = { __meta: true, phase: "deferred", at: new Date().toISOString(), ...(courseId ? { courseId } : {}) };
  const { data } = await service.from("document_topic_map_jobs").select("topics").eq("document_id", documentId).maybeSingle();
  if (!data) {
    await service.from("document_topic_map_jobs").insert({ document_id: documentId, topics: [marker] });
  } else if (!readCourseMeta(Array.isArray(data.topics) ? (data.topics as unknown[]) : [])) {
    await service.from("document_topic_map_jobs").update({ topics: [marker] }).eq("document_id", documentId);
  }
}

async function clearWaitMarkers(service: SupabaseClient, documentIds: string[]) {
  for (const documentId of documentIds) {
    const { data } = await service.from("document_topic_map_jobs").select("topics").eq("document_id", documentId).maybeSingle();
    if (readWaitMarker(data?.topics)) {
      await service.from("document_topic_map_jobs").delete().eq("document_id", documentId);
    }
  }
}

/**
 * A single-file caller (status poller, retry, rebuild) must not map a file
 * that a course outline will cover: it waits, and makes no model call.
 */
async function waitForCourse(
  service: SupabaseClient,
  courseId: string,
  documentIds: string[],
  topics: unknown[],
  nowMs: number,
): Promise<CourseMapResult | null> {
  const marker = readWaitMarker(topics);
  if (marker && !marker.courseId) {
    return isFresh(marker.at, nowMs) ? { ok: true, deferred: true, topics: 0 } : null;
  }
  let course = readCourseMeta(topics);
  if (marker?.courseId) {
    const { data } = await service.from("document_topic_map_jobs").select("topics").eq("document_id", marker.courseId).maybeSingle();
    course = readCourseMeta(Array.isArray(data?.topics) ? (data.topics as unknown[]) : []);
  }
  if (
    course &&
    course.courseDocumentIds.join(",") !== documentIds.join(",") &&
    course.courseDocumentIds.includes(courseId) &&
    isFresh(course.touchedAt, nowMs)
  ) {
    return { ok: true, pending: true, leaseBusy: true, topics: 0, stage: course.stage, round: course.rounds };
  }
  return null;
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
    .select("topics, lease_token")
    .maybeSingle();
  if (error) throw new Error("topic_map_job_claim_failed");
  return data
    ? { topics: Array.isArray(data.topics) ? (data.topics as unknown[]) : [], lease_token: data.lease_token as string }
    : null;
}

async function releaseMapJob(service: SupabaseClient, documentId: string, token: string) {
  await service.from("document_topic_map_jobs")
    .update({ lease_token: null, lease_until: null, updated_at: new Date().toISOString() })
    .eq("document_id", documentId)
    .eq("lease_token", token);
}

/** Keep the map lease alive while a long outline call runs. */
async function renewMapLease(service: SupabaseClient, documentId: string, token: string) {
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
  const unique = [...new Set(pageNumbers)];
  for (let offset = 0; offset < unique.length; offset += 40) {
    const chunk = unique.slice(offset, offset + 40);
    const { data, error } = await service.from("document_pages")
      .select("page_number, text_content")
      .eq("document_id", documentId)
      .in("page_number", chunk);
    if (error) throw new Error("page_load_failed");
    for (const row of data ?? []) {
      out.set(row.page_number as number, cleanOcrPageText((row.text_content as string | null) ?? ""));
    }
  }
  return out;
}

/** PageAnalysis from persisted page metadata (no text). */
function analysesFromLight(rows: LightPageRow[]): PageAnalysis[] {
  return rows.map((row) => ({
    pageNumber: row.page_number,
    textContent: "",
    extractionOk: row.extraction_ok !== false,
    pageKind: (row.page_kind as PageKind | null) ?? "content",
    headings: Array.isArray(row.headings) ? (row.headings as string[]) : [],
    formulas: [],
    tablesDetected: 0,
    imagesDetected: 0,
    uncertainRegions: [],
    extractionMethod: (row.extraction_method as ExtractionMethod | null) ?? "none",
    charCount: typeof row.char_count === "number" ? row.char_count : 0,
  }));
}

async function persistPageMeta(service: SupabaseClient, row: LightPageRow, analysis: PageAnalysis) {
  const preserved = row.extraction_method;
  const method =
    preserved === "ocr" || preserved === "visual" || preserved === "manual"
      ? preserved
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
    .eq("id", row.id);
  if (error) throw new Error("page_meta_update_failed");
}

async function persistCoverage(service: SupabaseClient, documentId: string, coverage: CoverageReport) {
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
  // Out of attempts: final until the student presses "Tekrar dene".
  if (message === "topic_map_unavailable") return false;
  if (message === "topic_map_no_readable_pages") return false;
  if (message === "topic_map_in_use") return false;
  if (message === "insufficient_credits" || message === "document_not_found") return false;
  return true;
}

/** Analyze every page once, persist page metadata, return the page texts. */
async function prepareDocument(
  service: SupabaseClient,
  documentId: string,
  persistMeta: boolean,
): Promise<{ analyses: PageAnalysis[]; light: LightPageRow[] }> {
  const light = await loadPageLight(service, documentId);
  const texts = await loadPageTexts(service, documentId, light.map((r) => r.page_number));
  const analyses = light.map((row) => {
    const analysis = analyzePage(row.page_number, texts.get(row.page_number) ?? "", row.extraction_method);
    if (row.extraction_ok === false) {
      analysis.extractionOk = false;
      if (analysis.pageKind === "content" || analysis.pageKind === "uncertain") {
        analysis.pageKind = "unreadable";
      }
    }
    if (row.page_kind === "blank") analysis.pageKind = "blank";
    return analysis;
  });
  if (persistMeta) {
    for (let offset = 0; offset < analyses.length; offset += 8) {
      await Promise.all(
        analyses.slice(offset, offset + 8).map((analysis, i) => persistPageMeta(service, light[offset + i]!, analysis)),
      );
    }
  }
  return { analyses, light };
}

function corpusFile(fileName: string, analyses: PageAnalysis[]): MaterialFileCorpus {
  return {
    fileName,
    pages: pagesForTopicMap(analyses).map((p) => ({
      pageNumber: p.pageNumber,
      text: p.pageKind === "toc" ? `İÇİNDEKİLER\n${p.textContent}` : p.textContent,
    })),
  };
}

function tocBlockFrom(files: { analyses: PageAnalysis[] }[]): string | null {
  const text = files
    .flatMap((file, index) =>
      file.analyses
        .filter((p) => p.pageKind === "toc")
        .map((p) => `d${index + 1}: ${p.textContent.slice(0, 1200)}`),
    )
    .join("\n")
    .slice(0, 4000);
  return text || null;
}

/** Existing prep topics, for "new file → previous outline" (add-source). */
async function previousOutlineForPrep(
  service: SupabaseClient,
  userId: string,
  prepId: string,
): Promise<OutlineUnitDraft[] | undefined> {
  const { data: prep } = await service
    .from("exam_preps")
    .select("id")
    .eq("id", prepId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!prep) return undefined;
  const { data: rows } = await service
    .from("exam_prep_topics")
    .select("label, sort_order")
    .eq("exam_prep_id", prepId)
    .order("sort_order");
  const titles = (rows ?? []).map((row) => String(row.label ?? "").trim()).filter(Boolean).slice(0, 60);
  if (!titles.length) return undefined;
  return [
    {
      title: "Mevcut konular",
      topics: titles.map((title) => ({ title, sourceTitles: [title], pageNumbers: [] })),
    },
  ];
}

/** A killed round leaves its reservations pending: refund them, never charge. */
async function refundStaleReservations(service: SupabaseClient, userId: string, keys: string[]) {
  if (!keys.length) return;
  const { data } = await service
    .from("credit_reservations")
    .select("id, status")
    .eq("user_id", userId)
    .in("idempotency_key", keys)
    .eq("status", "pending");
  for (const row of data ?? []) {
    await refundCredits(service, String(row.id)).catch(() => {});
  }
}

async function settleReservations(
  service: SupabaseClient,
  ids: string[],
  action: "commit" | "refund",
) {
  for (const id of [...new Set(ids)]) {
    try {
      if (action === "commit") await commitCredits(service, id);
      else await refundCredits(service, id);
    } catch {
      // A bookkeeping hiccup must never fail the student's map.
      console.error("outline_credit_settle_failed", { action });
    }
  }
}

/** Files whose topic nodes a plan (exam prep) uses. Lookup errors count as in use. */
async function docsWithMapInUse(service: SupabaseClient, documentIds: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const id of documentIds) {
    const { data } = await service.from("document_topic_nodes").select("id").eq("document_id", id);
    const nodeIds = (data ?? []).map((r) => r.id as string);
    if (!nodeIds.length) continue;
    if (await documentTopicMapIsInUse(service, id, nodeIds).catch(() => true)) out.push(id);
  }
  return out;
}

/** An in-use map is a working map: show it as ready, never failed/pending. */
async function keepInUseMaps(
  service: SupabaseClient,
  docs: { id: string; topic_map_status: string | null }[],
) {
  for (const doc of docs) {
    if (doc.topic_map_status === "ready" || doc.topic_map_status === "reviewed") continue;
    await service
      .from("documents")
      .update({ topic_map_status: "ready", topic_map_error: null, topic_map_updated_at: new Date().toISOString() })
      .eq("id", doc.id);
  }
}

/** After a refused persist: files with nodes keep them as ready; the rest may retry calmly. */
async function restoreAfterInUse(
  service: SupabaseClient,
  docs: { id: string }[],
  previous: Record<string, string | null>,
) {
  for (const doc of docs) {
    const { data } = await service.from("document_topic_nodes").select("id").eq("document_id", doc.id).limit(1);
    const before = previous[doc.id];
    const status = data?.length
      ? before === "reviewed" ? "reviewed" : "ready"
      : "failed";
    await service
      .from("documents")
      .update({
        topic_map_status: status,
        topic_map_error: status === "failed" ? "topic_map_unavailable" : null,
        topic_map_updated_at: new Date().toISOString(),
      })
      .eq("id", doc.id);
  }
}

/**
 * #247 on the course map: inside one file every page belongs to one topic and
 * topics are contiguous blocks in document order (overlapping pages taught the
 * same thing in two lessons). A topic fully covered by others merges into the
 * one that took most of its pages. The ONE course order (sort_order, unit)
 * stays the outline's: only the page sets change.
 */
function exclusiveLeafPages<L extends { topic: { title: string; pageNumbers: number[] }; order: number }>(
  leaves: L[],
): L[] {
  if (leaves.length < 2) return leaves;
  const ranged = exclusivePageRanges(
    leaves.map((leaf) => ({ title: leaf.topic.title, pageNumbers: leaf.topic.pageNumbers, leaf })),
  ).topics;
  const pagesOf = new Map(ranged.map((row) => [row.leaf, row.pageNumbers]));
  return leaves.flatMap((leaf) => {
    const pageNumbers = pagesOf.get(leaf);
    return pageNumbers?.length ? [{ ...leaf, topic: { ...leaf.topic, pageNumbers } }] : [];
  });
}

/**
 * Main's concept units (bb30f36) on the course map: a big topic is split into
 * one-lesson units by ONE uncharged call per file (TOPIC_UNITS usage only;
 * no call when no topic is big). Any failure → [] and the plan splits pages.
 */
async function leafConceptUnits(
  service: SupabaseClient,
  userId: string,
  documentId: string,
  light: LightPageRow[],
  leaves: { topic: { title: string; pageNumbers: number[] } }[],
  deadlineAt: number,
  now: () => number,
): Promise<ConceptUnit[][]> {
  const empty = leaves.map((): ConceptUnit[] => []);
  if (!leaves.some((leaf) => needsUnits(leaf.topic.pageNumbers))) return empty;
  try {
    const texts = await loadPageTexts(service, documentId, light.map((row) => row.page_number));
    const analyses = analysesFromLight(light).map((analysis) => ({
      ...analysis,
      textContent: texts.get(analysis.pageNumber) ?? "",
    }));
    return await buildConceptUnits(service, {
      userId,
      documentId,
      topics: leaves.map((leaf) => ({ title: leaf.topic.title, pageNumbers: leaf.topic.pageNumbers })),
      analyses,
      edges: repeatedEdgeLines(analyses.map((analysis) => analysis.textContent)),
      deadlineAt,
      now,
    });
  } catch {
    return empty;
  }
}

/**
 * Write the course outline onto each document, keeping ONE course order:
 * unit sort_order = its index in the whole course, leaf sort_order =
 * units + its index in the whole course. Unit nodes carry a course tag so
 * intake can merge the documents back into that single order.
 */
async function persistCourseOutline(
  service: SupabaseClient,
  userId: string,
  courseId: string,
  documentIds: string[],
  outline: OutlineUnitDraft[],
  /** Hard deadline for everything slow in persist (concept units). */
  deadlineAt: number,
  now: () => number = Date.now,
): Promise<number> {
  const { units } = flattenOutlineUnits(outline);
  const unitsTotal = units.length;
  let saved = 0;
  // Re-check in-use for every file before the first swap — a prep may have
  // linked one mid-round, and no file should be half-rewritten then.
  if ((await docsWithMapInUse(service, documentIds)).length) throw new Error("topic_map_in_use");

  // Everything that can be slow (page reads, the one concept-unit call per
  // file) happens before the first file is swapped.
  const plans = [];
  for (const [fileIndex, documentId] of documentIds.entries()) {
    const light = await loadPageLight(service, documentId);
    const cited: { topic: OutlineUnitDraft["topics"][number]; unitIndex: number; order: number }[] = [];
    let leafIndex = 0;
    units.forEach((unit, unitIndex) => {
      for (const topic of unit.topics) {
        if ((topic.fileIndex ?? 0) === fileIndex) {
          cited.push({ topic, unitIndex, order: unitsTotal + leafIndex });
        }
        leafIndex += 1;
      }
    });
    const leaves = exclusiveLeafPages(cited);
    plans.push({ fileIndex, documentId, light, leaves });
  }
  // One concept-unit call per file, all in parallel and bounded by the round
  // deadline (skipped when too little time is left). Any miss → [] and the
  // plan splits pages mechanically; the map is saved either way.
  const lessonsByFile = await Promise.all(
    plans.map((plan) => leafConceptUnits(service, userId, plan.documentId, plan.light, plan.leaves, deadlineAt, now)),
  );

  for (const [planIndex, { fileIndex, documentId, light, leaves }] of plans.entries()) {
    const lessons = lessonsByFile[planIndex] ?? [];
    const pageIdByNumber = new Map(light.map((row) => [row.page_number, row.id]));
    await clearTopicMap(service, documentId);

    const mine = units
      .map((unit, unitIndex) => ({ unit, unitIndex }))
      .filter(({ unit }) => unit.topics.some((t) => (t.fileIndex ?? 0) === fileIndex));
    const unitIds = new Map<number, string>();
    if (mine.length) {
      const { data: unitRows, error } = await service
        .from("document_topic_nodes")
        .insert(
          mine.map(({ unit, unitIndex }) => {
            const packed = packTopicPerspective({ examWeight: unit.examWeight ?? "medium" });
            return {
              document_id: documentId,
              parent_id: null,
              sort_order: unitIndex,
              title: unit.title,
              learning_objective: packed.learning_objective,
              prerequisites: packed.prerequisites,
              key_definitions: packed.key_definitions,
              key_relations: [...packed.key_relations, packCourseRelation(courseId)],
              worked_examples: [],
              common_mistakes: [],
              source_exercises: [],
            };
          }),
        )
        .select("id, sort_order");
      if (error || unitRows?.length !== mine.length) throw new Error("topic_insert_failed");
      for (const row of unitRows) unitIds.set(row.sort_order as number, row.id as string);
    }

    const drafts: TopicDraft[] = [];
    if (leaves.length) {
      const { data: leafRows, error } = await service
        .from("document_topic_nodes")
        .insert(
          leaves.map(({ topic, unitIndex, order }, index) => {
            const packed = packTopicPerspective({
              examWeight: topic.examWeight ?? units[unitIndex]?.examWeight ?? "medium",
              likelyAsked: topic.likelyAsked,
              whyLearn: topic.whyLearn ?? topic.description,
              prerequisiteTitles: topic.prerequisiteTitles,
            });
            return {
              document_id: documentId,
              parent_id: unitIds.get(unitIndex) ?? null,
              sort_order: order,
              units: lessons[index] ?? [],
              title: topic.title,
              ...packed,
              worked_examples: [],
              common_mistakes: [],
              source_exercises: [],
            };
          }),
        )
        .select("id, sort_order");
      if (error || leafRows?.length !== leaves.length) throw new Error("topic_insert_failed");
      const idByOrder = new Map(leafRows.map((row) => [row.sort_order as number, row.id as string]));
      const links: Record<string, unknown>[] = [];
      for (const { topic, order } of leaves) {
        const topicId = idByOrder.get(order);
        if (!topicId) throw new Error("topic_insert_failed");
        // Only the pages the outline cited — never pages it did not name.
        for (const pageNumber of topic.pageNumbers) {
          const pageId = pageIdByNumber.get(pageNumber);
          if (pageId) {
            links.push({ document_id: documentId, topic_id: topicId, page_id: pageId, page_number: pageNumber, relevance: "primary" });
          }
        }
        drafts.push({
          title: topic.title,
          learningObjective: topic.whyLearn ?? null,
          prerequisites: [],
          keyDefinitions: [],
          keyRelations: [],
          workedExamples: [],
          commonMistakes: [],
          sourceExercises: [],
          pageNumbers: topic.pageNumbers,
          mergeKey: topicId,
        });
      }
      for (let offset = 0; offset < links.length; offset += 200) {
        const { error: linkError } = await service
          .from("document_topic_page_links")
          .insert(links.slice(offset, offset + 200));
        if (linkError) throw new Error("topic_link_failed");
      }
    }
    await persistCoverage(service, documentId, buildCoverageReport(analysesFromLight(light), drafts, []));
    saved += leaves.length;
  }
  return saved;
}

function newAttemptId(): string {
  return crypto.randomUUID().slice(0, 8);
}

/**
 * ONE course-level topic map pipeline, run in bounded rounds by the process
 * route (lease + heartbeat + checkpoint in document_topic_map_jobs of the
 * course's first document). A single upload is a course of one file.
 *
 *   prepare  → analyze every page of every file (cheap, no model)
 *   outline  → one stage per round (see runOutlineStep): one call over the
 *              whole course, escalate / repair / fallback only when needed
 *   persist  → write every document in one course order, then settle credits
 *
 * Credits: every outline call reserves under
 * `outline:{courseId}:{contentHash}:{attemptId}:{stage}[:partN]` with
 * deferCommit. Only the calls that produced the saved map are committed —
 * after persist succeeds. Discarded drafts are refunded at once; calls a
 * killed round left pending are refunded by the next round.
 */
export async function runCourseMapRound(
  service: SupabaseClient,
  input: {
    documentIds: string[];
    examLabel?: string | null;
    examDate?: string | null;
    /** Add-source: reuse this prep's topic names for the new file. */
    prepId?: string | null;
    /** Absolute deadline for this round (defaults to now + budget). */
    deadlineAt?: number;
    now?: () => number;
    /**
     * The wizard's course request: it owns these files. Other callers wait
     * for a course that covers the file instead of mapping it alone.
     */
    fromCourse?: boolean;
    /** The student asked to rebuild a ready map. */
    rebuild?: boolean;
  },
): Promise<CourseMapResult> {
  const now = input.now ?? Date.now;
  const roundStarted = now();
  const deadlineAt = input.deadlineAt ?? roundStarted + COURSE_ROUND_BUDGET_MS;
  const documentIds = [...new Set(input.documentIds)];
  const courseId = documentIds[0];
  if (!courseId) return { ok: false, topics: 0, error: "document_not_found", retryable: false };
  let meta: CourseMeta | null = null;

  const fail = async (message: string): Promise<CourseMapResult> => {
    const retryable = isRetryableMapError(message);
    console.error("course_map_failed", { courseId, error: message, stage: meta?.stage ?? null });
    // A map a plan uses is never marked failed: it stays as it is.
    if (!retryable && message !== "topic_map_in_use") {
      for (const documentId of documentIds) {
        const previous = meta?.previousStatus?.[documentId] ?? null;
        const kept = previous === "ready" || previous === "reviewed";
        await service
          .from("documents")
          .update({
            // A failed rebuild keeps the old map: it is simply ready again.
            topic_map_status: kept ? previous : "failed",
            topic_map_error: kept ? null : message,
            topic_map_updated_at: new Date().toISOString(),
          })
          .eq("id", documentId);
      }
    }
    return { ok: false, topics: 0, error: message, retryable, stage: meta?.stage };
  };

  let docs: { id: string; user_id: string; file_name: string | null; topic_map_status: string | null }[];
  try {
    const { data, error } = await service
      .from("documents")
      .select("id, user_id, file_name, topic_map_status")
      .in("id", documentIds)
      .is("deleted_at", null);
    if (error) throw new Error("document_load_failed");
    const byId = new Map((data ?? []).map((row) => [row.id as string, row]));
    docs = documentIds.map((id) => byId.get(id)).filter(Boolean) as typeof docs;
  } catch {
    return fail("document_load_failed");
  }
  const userId = docs[0]?.user_id;
  if (docs.length !== documentIds.length || !userId || docs.some((d) => d.user_id !== userId)) {
    return fail("document_not_found");
  }

  const job = await claimMapJob(service, courseId).catch(() => null);
  if (!job) {
    const { data } = await service.from("document_topic_map_jobs").select("topics").eq("document_id", courseId).maybeSingle();
    const busy = readCourseMeta(Array.isArray(data?.topics) ? (data.topics as unknown[]) : []);
    return { ok: true, pending: true, leaseBusy: true, topics: 0, stage: busy?.stage ?? "prepare", round: busy?.rounds ?? 0 };
  }
  const token = job.lease_token;
  if (!input.fromCourse) {
    const wait = await waitForCourse(service, courseId, documentIds, job.topics, now()).catch(() => null);
    const nothingToDo =
      !readCourseMeta(job.topics) &&
      !input.rebuild &&
      docs.every((d) => d.topic_map_status === "ready" || d.topic_map_status === "reviewed");
    if (wait || nothingToDo) {
      await releaseMapJob(service, courseId, token);
      return wait ?? { ok: true, topics: 0 };
    }
  }
  const heartbeat = setInterval(() => void renewMapLease(service, courseId, token), Math.max(30_000, Math.floor(MAP_LEASE_MS / 3)));
  const checkpoint = async () => {
    meta!.touchedAt = new Date(now()).toISOString();
    const { data, error } = await service
      .from("document_topic_map_jobs")
      .update({ topics: [meta], updated_at: new Date().toISOString() })
      .eq("document_id", courseId)
      .eq("lease_token", token)
      .select("document_id");
    if (error || !data?.length) throw new Error("topic_map_claim_lost");
  };
  const pending = (): CourseMapResult => ({ ok: true, pending: true, topics: 0, stage: meta!.stage, round: meta!.rounds });
  const timing = (stage: string, extra: Record<string, unknown>) =>
    console.info("pipeline_timing", { documentId: courseId, files: documentIds.length, stage, ...extra });
  const others = documentIds.filter((id) => id !== courseId);
  /** Out of attempts: never a fabricated list; a calm "Tekrar dene" state. */
  const giveUp = async (held: OutlineProgress | undefined) => {
    if (held) await settleReservations(service, reservationsHeld(held), "refund");
    await service.from("document_topic_map_jobs").delete().eq("document_id", courseId).eq("lease_token", token);
    await clearWaitMarkers(service, others);
    return fail("topic_map_unavailable");
  };

  try {
    meta = readCourseMeta(job.topics);
    if (meta && meta.courseDocumentIds.join(",") !== documentIds.join(",")) {
      // Another file set now: its calls and held drafts are never charged.
      await refundStaleReservations(service, userId, meta.inflight ?? []);
      await settleReservations(service, [
        ...(meta.progress ? reservationsHeld(meta.progress) : []),
        ...(meta.outline?.reservationIds ?? []),
      ], "refund");
      meta = null;
    }
    if (!meta) {
      // A map a plan already uses is never rewritten (as on main): refuse
      // before any call, and leave its status and nodes exactly as they are.
      const inUse = await docsWithMapInUse(service, docs.map((d) => d.id));
      if (inUse.length) {
        await keepInUseMaps(service, docs.filter((d) => inUse.includes(d.id)));
        return { ok: false, topics: 0, error: "topic_map_in_use", retryable: false };
      }
      meta = {
        __meta: true,
        phase: "course",
        courseDocumentIds: documentIds,
        attemptId: newAttemptId(),
        stage: "prepare",
        rounds: 0,
        failures: 0,
        calls: 0,
        previousStatus: Object.fromEntries(docs.map((d) => [d.id, d.topic_map_status])),
        examLabel: input.examLabel ?? null,
        examDate: input.examDate ?? null,
        prepId: input.prepId ?? null,
      };
      await service
        .from("documents")
        .update({ topic_map_status: "pending", topic_map_error: null, topic_map_updated_at: new Date().toISOString() })
        .in("id", documentIds);
      await checkpoint();
      // The other files now wait for this course (pollers make no call).
      for (const id of others) await markMapDeferred(service, id, courseId);
    }
    meta.rounds += 1;
    if (meta.inflight?.length) {
      await refundStaleReservations(service, userId, meta.inflight);
      meta.inflight = [];
      meta.attemptId = newAttemptId();
    }

    // ——— prepare + outline stages: need the page text of every file ———
    if (meta.stage !== "persist") {
      const prepareStarted = now();
      const prepared = await Promise.all(
        docs.map(async (doc) => ({
          doc,
          ...(await prepareDocument(service, doc.id, meta!.stage === "prepare")),
        })),
      );
      const files = prepared.map(({ doc, analyses }) => corpusFile(doc.file_name ?? "belge", analyses));
      if (!files.some((file) => file.pages.length)) throw new Error("topic_map_no_readable_pages");
      if (meta.stage === "prepare") {
        timing("map_prepare", { ms: now() - prepareStarted, pages: files.reduce((n, f) => n + f.pages.length, 0) });
        meta.stage = "first";
        meta.progress = { stage: "first" };
        await checkpoint();
      }

      const material = prepareOutlineMaterial(files);
      const progress: OutlineProgress = meta.progress ?? { stage: meta.stage as OutlineStage };
      const previousOutline = meta.prepId ? await previousOutlineForPrep(service, userId, meta.prepId) : undefined;
      const stageStarted = now();
      const held = meta.progress;
      const step: OutlineStepResult =
        (meta.calls ?? 0) >= MAX_OUTLINE_CALLS
          ? held?.best
            ? { kind: "done", map: held.best, path: "kept", release: [] }
            : { kind: "exhausted", release: [], reason: "rejected" }
          : await runOutlineStep({
              service,
              userId,
              material,
              progress,
              examLabel: input.examLabel ?? meta.examLabel ?? null,
              examDate: input.examDate ?? meta.examDate ?? null,
              tocBlock: tocBlockFrom(prepared),
              previousOutline,
              deadlineAt: deadlineAt - POST_CALL_RESERVE_MS,
              now,
              keyFor: (stage, part) =>
                `outline:${courseId}:${material.contentHash}:${meta!.attemptId}:${stage}${part ? `:part${part}` : ""}`,
              onCallStart: async (keys) => {
                meta!.inflight = keys;
                meta!.calls = (meta!.calls ?? 0) + 1;
                await checkpoint();
              },
            });
      if (step.kind !== "wait") {
        // The call settled: its key is spent, the next call gets a new one.
        meta.inflight = [];
        meta.attemptId = newAttemptId();
      }
      if ("release" in step) await settleReservations(service, step.release, "refund");
      timing("outline_stage", {
        outlineStage: progress.stage,
        result: step.kind,
        ms: now() - stageStarted,
        calls: meta.calls ?? 0,
        pages: material.pageCount,
        corpusChars: material.corpus.length,
        routedModel: material.routed.model,
        parts: material.parts?.length ?? 1,
        ...(step.kind === "done"
          ? { model: step.map.model, path: step.path, units: step.map.units.length, topics: step.map.kept, droppedTopics: step.map.dropped }
          : {}),
        ...(step.kind === "exhausted" ? { reason: step.reason } : {}),
      });

      if (step.kind === "wait") {
        await checkpoint();
        return pending();
      }
      if (step.kind === "blocked") throw new Error(step.error);
      let kept = step.kind === "done" ? { map: step.map, path: step.path } : null;
      if (!kept) {
        // Validation rejecting every draft of a cycle is final; only provider
        // failures (and our own deadline) retry, within both budgets.
        const provider = step.kind === "exhausted" && step.reason === "provider";
        if (step.kind === "continue") {
          meta.progress = step.progress;
          meta.stage = step.progress.stage;
          if (step.failed) meta.failures += 1;
        }
        if (provider) meta.failures += 1;
        const budgetLeft = meta.failures < MAX_OUTLINE_FAILURES && (meta.calls ?? 0) < MAX_OUTLINE_CALLS;
        if (budgetLeft && (step.kind === "continue" || provider)) {
          if (provider) {
            meta.progress = { stage: "first" };
            meta.stage = "first";
          }
          await checkpoint();
          return pending();
        }
        const last = step.kind === "continue" ? step.progress : undefined;
        if (!last?.best) return await giveUp(last);
        // Out of budget with a usable (validated) map: keep it.
        const keep = new Set(last.best.reservationIds);
        await settleReservations(service, reservationsHeld(last).filter((id) => !keep.has(id)), "refund");
        kept = { map: last.best, path: "kept" };
      }
      meta.outline = {
        units: kept.map.units,
        model: kept.map.model,
        path: kept.path,
        dropped: kept.map.dropped,
        reservationIds: kept.map.reservationIds,
      };
      meta.progress = undefined;
      meta.stage = "persist";
      await checkpoint();
      if (deadlineAt - now() < PERSIST_RESERVE_MS) return pending();
    }

    // ——— persist: one course order across documents, then settle credits ———
    const outline = meta.outline;
    if (!outline?.units.length) {
      meta.stage = "first";
      meta.progress = { stage: "first" };
      await checkpoint();
      return pending();
    }
    const persistStarted = now();
    const topics = await persistCourseOutline(
      service, userId as string, courseId, documentIds, outline.units, deadlineAt - POST_CALL_RESERVE_MS, now,
    );
    const nowIso = new Date().toISOString();
    const { error: docError } = await service
      .from("documents")
      .update({ topic_map_status: "ready", topic_map_error: null, topic_map_updated_at: nowIso })
      .in("id", documentIds);
    if (docError) throw new Error("document_status_update_failed");
    await settleReservations(service, outline.reservationIds, "commit");
    await service.from("document_topic_map_jobs").delete().eq("document_id", courseId).eq("lease_token", token);
    await clearWaitMarkers(service, others);
    timing("persist", { ms: now() - persistStarted, topics, units: outline.units.length, model: outline.model, path: outline.path, droppedTopics: outline.dropped, roundMs: now() - roundStarted });
    return { ok: true, topics, stage: "persist", round: meta.rounds };
  } catch (error) {
    const message = error instanceof Error ? error.message : "topic_map_failed";
    if (message === "topic_map_claim_lost") {
      return { ok: true, pending: true, topics: 0, stage: meta?.stage, round: meta?.rounds };
    }
    if (message === "topic_map_in_use" && meta) {
      // A plan linked a file mid-round: nothing is charged, every map stays usable.
      await refundStaleReservations(service, userId, meta.inflight ?? []).catch(() => undefined);
      await settleReservations(service, [
        ...(meta.progress ? reservationsHeld(meta.progress) : []),
        ...(meta.outline?.reservationIds ?? []),
      ], "refund");
      await service.from("document_topic_map_jobs").delete().eq("document_id", courseId).eq("lease_token", token);
      await clearWaitMarkers(service, others);
      await restoreAfterInUse(service, docs, meta.previousStatus ?? {});
    }
    return fail(message);
  } finally {
    clearInterval(heartbeat);
    await releaseMapJob(service, courseId, token);
  }
}

function reservationsHeld(progress: OutlineProgress): string[] {
  return [
    ...(progress.best?.reservationIds ?? []),
    ...(progress.parts ?? []).flatMap((p) => (p?.reservationId ? [p.reservationId] : [])),
  ];
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
/**
 * Course mode: the first file (in order) that still needs extraction.
 * "missing" when any id is absent or belongs to someone else.
 */
export async function firstUnextractedDocument(
  service: SupabaseClient,
  userId: string,
  documentIds: string[],
): Promise<string | null | "missing"> {
  const { data: docs } = await service
    .from("documents")
    .select("id, user_id, status, mime_type")
    .in("id", documentIds)
    .is("deleted_at", null);
  const byId = new Map((docs ?? []).map((d) => [d.id as string, d]));
  for (const id of documentIds) {
    const doc = byId.get(id);
    if (!doc || doc.user_id !== userId) return "missing";
  }
  for (const id of documentIds) {
    const doc = byId.get(id)!;
    const { count } = await service
      .from("document_chunks")
      .select("id", { count: "exact", head: true })
      .eq("document_id", id);
    if (!count) return id;
    if (doc.mime_type !== "application/pdf" || doc.status === "completed") continue;
    const { data: state } = await service
      .from("document_ingestion_state")
      .select("status")
      .eq("document_id", id)
      .maybeSingle();
    if (state?.status !== "ready") return id;
  }
  return null;
}

/**
 * Which files of a course still need the course outline. A ready map that is
 * in use is never rewritten, so it stays out; the rest share one outline,
 * tagged with the first remaining file. Empty = nothing to do.
 */
export async function planCourseMap(
  service: SupabaseClient,
  documentIds: string[],
): Promise<string[]> {
  const { data: docs } = await service
    .from("documents")
    .select("id, topic_map_status")
    .in("id", documentIds);
  const ready = new Set(
    (docs ?? [])
      .filter((d) => d.topic_map_status === "ready" || d.topic_map_status === "reviewed")
      .map((d) => d.id as string),
  );
  const nodesOf = new Map<string, { id: string; parent_id: string | null; key_relations: unknown }[]>();
  const candidates: string[] = [];
  for (const id of documentIds) {
    const { data: nodes } = await service
      .from("document_topic_nodes")
      .select("id, parent_id, key_relations")
      .eq("document_id", id);
    const rows = (nodes ?? []) as { id: string; parent_id: string | null; key_relations: unknown }[];
    // A map a plan uses is kept as it is, whatever its status says.
    if (rows.length && (await documentTopicMapIsInUse(service, id, rows.map((r) => r.id)).catch(() => true))) continue;
    if (!ready.has(id)) {
      candidates.push(id);
      continue;
    }
    nodesOf.set(id, rows);
    candidates.push(id);
  }
  if (candidates.length <= 1) return candidates.filter((id) => !ready.has(id));
  const courseId = candidates[0]!;
  const done = candidates.every((id) => {
    const rows = nodesOf.get(id);
    if (!rows) return false;
    return !rows.length || rows.some((n) => n.parent_id == null && readCourseFromRelations(n.key_relations) === courseId);
  });
  return done ? [] : candidates;
}

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
): Promise<{ regenerating: boolean }> {
  const needs = await unusedFlatMapNeedsOneshot(service, documentId);
  if (!needs) return { regenerating: false };

  // Keep the old map until the new one is ready — mark pending without wipe.
  // The course round (process route) swaps only after a successful outline;
  // intake itself never runs a long model call.
  await service.from("document_topic_map_jobs").delete().eq("document_id", documentId);
  const { error } = await service
    .from("documents")
    .update({
      topic_map_status: "pending",
      topic_map_error: null,
      topic_map_updated_at: new Date().toISOString(),
    })
    .eq("id", documentId);
  return { regenerating: !error };
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
        .select("id, title, learning_objective, prerequisites, is_student_edited, sort_order, parent_id")
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
  // Outline maps (units → topics) are already validated; folding is for old flat maps.
  if (topicRows.some((row) => row.parent_id != null)) return false;
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
