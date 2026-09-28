/**
 * One-shot study outline: one model call over the whole material returns
 * units→topics + learning path (teacher + student perspectives).
 *
 * Routing: ≤30 page entries (summed across every uploaded file) → gpt-4o-mini;
 * more (or corpus too large for mini) → gpt-4.1. Validation drops bad topics
 * instead of rejecting the whole map; a draft that keeps nothing escalates to
 * the strong model and then gets one repair pass over the cited pages only.
 * Total failure → empty retryable result (no fake list).
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { generateJson, isPremiumUser } from "@/lib/ai/generate";
import { env } from "@/lib/env";
import type { OutlineUnitDraft } from "@/lib/documents/outline-clean";
import { buildGroundingFile, groundTopic, type GroundingFile } from "@/lib/documents/outline-grounding";

/** Soft page threshold for the cheaper outline model. */
export const OUTLINE_MINI_PAGE_LIMIT = 30;
/** ~100k tokens — stay under mini context with prompt margin. */
export const ONESHOT_MAX_INPUT_CHARS = 280_000;
/** gpt-4.1 1M context — whole-book corpus without splitting. */
export const ONESHOT_STRONG_MAX_CHARS = 2_500_000;
/**
 * ~700k tokens of Turkish/Latin text (~3 chars/token). Above this, one
 * gpt-4.1 call is unreliable — force-split on file/page boundaries.
 */
export const ONESHOT_FORCE_SPLIT_CHARS = 2_100_000;
/** ~1000 pages → auto-split even when char count is moderate. */
export const ONESHOT_FORCE_SPLIT_PAGES = 1000;
/** Per-part corpus budget when force-splitting a huge book. */
export const ONESHOT_FORCE_SPLIT_PART_CHARS = 350_000;
/** Force-split path may use more parts for ~1000-page books. */
export const ONESHOT_FORCE_SPLIT_MAX_PARTS = 8;
/** A whole book in one call needs far more than the 90s default. */
export const OUTLINE_CALL_TIMEOUT_MS = 240_000;
/** Silent 429/5xx/timeout attempts inside one reservation. */
export const OUTLINE_TRANSIENT_ATTEMPTS = 4;

export function outlineStandardModel(): string {
  return (
    env.OPENAI_OUTLINE_STANDARD_MODEL?.trim() ||
    env.OPENAI_STANDARD_MODEL?.trim() ||
    "gpt-4o-mini"
  );
}

export function outlineStrongModel(): string {
  return env.OPENAI_OUTLINE_STRONG_MODEL?.trim() || "gpt-4.1";
}

/** Second model when gpt-4.1 keeps failing (env-configurable). */
export function outlineFallbackModel(): string {
  return env.OPENAI_OUTLINE_FALLBACK_MODEL?.trim() || "gpt-4.1-mini";
}

/** Huge corpus / page count that cannot fit one reliable gpt-4.1 call. */
export function needsForceSplit(input: {
  pageCount: number;
  corpusChars: number;
}): boolean {
  return (
    input.pageCount >= ONESHOT_FORCE_SPLIT_PAGES ||
    input.corpusChars > ONESHOT_FORCE_SPLIT_CHARS
  );
}

export type OutlineModelChoice = {
  model: string;
  tier: "standard" | "strong";
  reason: "page_count" | "corpus_size" | "escalation" | "repair";
};

/** Pick outline model from material size (total pages + corpus chars). */
export function selectOutlineModel(input: {
  pageCount: number;
  corpusChars: number;
}): OutlineModelChoice {
  if (
    input.pageCount > OUTLINE_MINI_PAGE_LIMIT ||
    input.corpusChars > ONESHOT_MAX_INPUT_CHARS
  ) {
    return {
      model: outlineStrongModel(),
      tier: "strong",
      reason: input.pageCount > OUTLINE_MINI_PAGE_LIMIT ? "page_count" : "corpus_size",
    };
  }
  return {
    model: outlineStandardModel(),
    tier: "standard",
    reason: "page_count",
  };
}

const MAX_UNITS = 20;
const MAX_TOPICS_TOTAL = 40;
const MAX_TOPICS_PER_UNIT = 40;
const MAX_TITLE_CHARS = 120;
const MAX_TEXT_CHARS = 400;
const MAX_LIKELY_ASKED = 4;
const MAX_LIKELY_ASKED_CHARS = 160;
const MAX_ID_CHARS = 40;
const MAX_PREREQS = 8;

const examWeightSchema = z.enum(["high", "medium", "low"]);

const topicSchema = z.object({
  id: z.string().trim().min(1).max(MAX_ID_CHARS).optional(),
  title: z.string().trim().min(1).max(MAX_TITLE_CHARS),
  description: z.string().trim().max(MAX_TEXT_CHARS).optional().default(""),
  whyLearn: z.string().trim().max(MAX_TEXT_CHARS).optional().default(""),
  /** 0-based index into the uploaded file list (`d1` in markers → 0). */
  fileIndex: z.number().int().min(0).optional().default(0),
  pageStart: z.number().int().positive(),
  pageEnd: z.number().int().positive(),
  examWeight: examWeightSchema.optional().default("medium"),
  likelyAsked: z
    .array(z.string().trim().min(1).max(MAX_LIKELY_ASKED_CHARS))
    .max(MAX_LIKELY_ASKED)
    .optional()
    .default([]),
  prerequisiteIds: z
    .array(z.string().trim().min(1).max(MAX_ID_CHARS))
    .max(MAX_PREREQS)
    .optional()
    .default([]),
});

const unitSchema = z.object({
  title: z.string().trim().min(1).max(MAX_TITLE_CHARS),
  examWeight: examWeightSchema.optional().default("medium"),
  topics: z.array(topicSchema).min(1).max(MAX_TOPICS_PER_UNIT),
});

export const oneShotOutlineSchema = z.object({
  units: z.array(unitSchema).min(1).max(MAX_UNITS),
});

export type OneShotOutlineDraft = z.infer<typeof oneShotOutlineSchema>;

/** OpenAI `response_format` schema — mirrors the zod shape above. */
export const oneShotJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["units"],
  properties: {
    units: {
      type: "array",
      minItems: 1,
      maxItems: MAX_UNITS,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "examWeight", "topics"],
        properties: {
          title: { type: "string" },
          examWeight: { type: "string", enum: ["high", "medium", "low"] },
          topics: {
            type: "array",
            minItems: 1,
            maxItems: MAX_TOPICS_PER_UNIT,
            items: {
              type: "object",
              additionalProperties: false,
              required: [
                "id",
                "title",
                "whyLearn",
                "description",
                "fileIndex",
                "pageStart",
                "pageEnd",
                "examWeight",
                "likelyAsked",
                "prerequisiteIds",
              ],
              properties: {
                id: { type: "string" },
                title: { type: "string" },
                whyLearn: { type: "string" },
                description: { type: "string" },
                fileIndex: { type: "integer", minimum: 0 },
                pageStart: { type: "integer", minimum: 1 },
                pageEnd: { type: "integer", minimum: 1 },
                examWeight: { type: "string", enum: ["high", "medium", "low"] },
                likelyAsked: {
                  type: "array",
                  maxItems: MAX_LIKELY_ASKED,
                  items: { type: "string" },
                },
                prerequisiteIds: {
                  type: "array",
                  maxItems: MAX_PREREQS,
                  items: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
  },
};

export type MaterialFileCorpus = {
  fileName: string;
  pages: { pageNumber: number; text: string }[];
  /**
   * 0-based index in the whole course (`d1` → 0). Split parts keep it so a
   * part holding the second file still says [d2 s.N].
   */
  fileIndex?: number;
};

/** Page text lookup key — pages repeat across files, page numbers do not. */
export function pageKey(fileIndex: number, page: number): string {
  return `${fileIndex}:${page}`;
}

/** Number keys are the legacy single-file form and still resolve. */
export type PageTextMap = Map<string, string> | Map<number, string>;

export function buildMaterialCorpus(files: MaterialFileCorpus[]): string {
  const parts: string[] = [];
  files.forEach((file, position) => {
    const label = `d${(file.fileIndex ?? position) + 1}`;
    parts.push(`=== Dosya ${label}: ${file.fileName} ===`);
    for (const page of file.pages) {
      const body = (page.text ?? "").replace(/\s+/g, " ").trim();
      if (!body) continue;
      parts.push(`[${label} s.${page.pageNumber}] ${body}`);
    }
  });
  return parts.join("\n");
}

/** Corpus restricted to the given page references — used by the repair pass. */
export function buildCitedPagesCorpus(
  files: MaterialFileCorpus[],
  refs: { fileIndex: number; pageStart: number; pageEnd: number }[],
): string {
  const wanted = new Map<number, Set<number>>();
  for (const ref of refs) {
    const fileIndex = files.length === 1 ? (files[0]!.fileIndex ?? 0) : ref.fileIndex;
    if (fileIndex < 0) continue;
    const start = Math.max(1, Math.min(ref.pageStart, ref.pageEnd));
    const end = Math.max(ref.pageStart, ref.pageEnd);
    const set = wanted.get(fileIndex) ?? new Set<number>();
    for (let p = start; p <= end && p - start < 200; p += 1) set.add(p);
    wanted.set(fileIndex, set);
  }
  if (!wanted.size) return "";
  const parts: string[] = [];
  files.forEach((file, position) => {
    const fileIndex = file.fileIndex ?? position;
    const pages = wanted.get(fileIndex);
    if (!pages?.size) return;
    const label = `d${fileIndex + 1}`;
    const lines: string[] = [];
    for (const page of file.pages) {
      if (!pages.has(page.pageNumber)) continue;
      const body = (page.text ?? "").replace(/\s+/g, " ").trim();
      if (!body) continue;
      lines.push(`[${label} s.${page.pageNumber}] ${body}`);
    }
    if (!lines.length) return;
    parts.push(`=== Dosya ${label}: ${file.fileName} ===`, ...lines);
  });
  return parts.join("\n");
}

export function pageTextMapFromFiles(files: MaterialFileCorpus[]): Map<string, string> {
  const map = new Map<string, string>();
  files.forEach((file, position) => {
    for (const page of file.pages) {
      const key = pageKey(file.fileIndex ?? position, page.pageNumber);
      const prev = map.get(key) ?? "";
      const body = (page.text ?? "").trim();
      map.set(key, prev ? `${prev}\n${body}` : body);
    }
  });
  return map;
}

/** Highest valid page number per file — the bound page refs are checked against. */
export function filePageBounds(files: MaterialFileCorpus[]): number[] {
  return files.map((file) =>
    Math.max(1, ...file.pages.map((p) => p.pageNumber).filter(Number.isFinite)),
  );
}

/**
 * Split material into parallel outline parts on file and page boundaries.
 * Never breaks mid-page. Prefers whole-file chunks when a file fits.
 * Also respects a page budget so ~1000 short OCR pages still shard.
 */
export function splitFilesForOutline(
  files: MaterialFileCorpus[],
  options?: {
    maxCharsPerPart?: number;
    maxParts?: number;
    maxPagesPerPart?: number;
  },
): MaterialFileCorpus[][] {
  const maxChars = options?.maxCharsPerPart ?? ONESHOT_FORCE_SPLIT_PART_CHARS;
  const maxParts = options?.maxParts ?? ONESHOT_FORCE_SPLIT_MAX_PARTS;
  const totalPages = files.reduce((n, f) => n + f.pages.length, 0);
  const maxPages =
    options?.maxPagesPerPart ??
    Math.max(80, Math.ceil(totalPages / maxParts));
  const parts: MaterialFileCorpus[][] = [];
  let current: MaterialFileCorpus[] = [];
  let currentChars = 0;
  let currentPages = 0;

  const flush = () => {
    if (!current.length) return;
    parts.push(current);
    current = [];
    currentChars = 0;
    currentPages = 0;
  };

  const pageChars = (page: { text: string }) =>
    (page.text ?? "").replace(/\s+/g, " ").trim().length + 24;

  const wouldExceed = (addChars: number, addPages: number) =>
    (current.length > 0 &&
      (currentChars + addChars > maxChars || currentPages + addPages > maxPages)) ||
    false;

  for (const file of files) {
    const fileHeader = 40 + file.fileName.length;
    let fileChars = fileHeader;
    for (const page of file.pages) fileChars += pageChars(page);
    const filePageCount = file.pages.length;

    // Whole file fits in the current / a fresh part.
    if (
      fileChars <= maxChars &&
      filePageCount <= maxPages &&
      !wouldExceed(fileChars, filePageCount)
    ) {
      current.push(file);
      currentChars += fileChars;
      currentPages += filePageCount;
      if (
        parts.length < maxParts - 1 &&
        (currentChars >= maxChars * 0.85 || currentPages >= maxPages)
      ) {
        flush();
      }
      continue;
    }
    if (
      fileChars <= maxChars &&
      filePageCount <= maxPages &&
      wouldExceed(fileChars, filePageCount)
    ) {
      flush();
      if (parts.length >= maxParts - 1) {
        current.push(file);
        currentChars += fileChars;
        currentPages += filePageCount;
        continue;
      }
      current.push(file);
      currentChars = fileChars;
      currentPages = filePageCount;
      continue;
    }

    // Split this file across page boundaries.
    let pageBuf: MaterialFileCorpus["pages"] = [];
    let pageBufChars = fileHeader;
    const flushPages = () => {
      if (!pageBuf.length) return;
      const addPages = pageBuf.length;
      if (wouldExceed(pageBufChars, addPages)) flush();
      current.push({ ...file, pages: pageBuf });
      currentChars += pageBufChars;
      currentPages += addPages;
      pageBuf = [];
      pageBufChars = fileHeader;
      if (
        parts.length < maxParts - 1 &&
        (currentChars >= maxChars * 0.85 || currentPages >= maxPages)
      ) {
        flush();
      }
    };
    for (const page of file.pages) {
      const add = pageChars(page);
      if (
        pageBuf.length &&
        (pageBufChars + add > maxChars || pageBuf.length + 1 > maxPages)
      ) {
        flushPages();
      }
      if (parts.length >= maxParts - 1) {
        pageBuf.push(page);
        pageBufChars += add;
        continue;
      }
      pageBuf.push(page);
      pageBufChars += add;
    }
    flushPages();
  }
  flush();

  if (parts.length > maxParts) {
    const head = parts.slice(0, maxParts - 1);
    const tail = parts.slice(maxParts - 1).flat();
    return [...head, tail];
  }
  return parts.length ? parts : [files];
}

/** One grounding index per file, built lazily and only once per validation. */
function groundingIndex(texts: PageTextMap | undefined) {
  const cache = new Map<number, GroundingFile | null>();
  return (fileIndex: number): GroundingFile | null => {
    if (!texts) return null;
    if (cache.has(fileIndex)) return cache.get(fileIndex) ?? null;
    const pages = new Map<number, string>();
    const lookup = texts as Map<string | number, string>;
    for (const [key, text] of lookup) {
      if (typeof key === "number") {
        if (fileIndex === 0) pages.set(key, text);
        continue;
      }
      const [f, p] = key.split(":").map(Number);
      if (f === fileIndex && Number.isFinite(p)) pages.set(p!, text);
    }
    const file = pages.size ? buildGroundingFile(pages) : null;
    cache.set(fileIndex, file);
    return file;
  };
}

export type OneShotValidationIssue =
  | { code: "unit_count"; units: number }
  | { code: "topic_count"; topics: number }
  | { code: "empty_title" }
  | { code: "empty_unit"; title: string }
  | { code: "duplicate_topic"; title: string }
  | {
      code: "page_range";
      title: string;
      fileIndex: number;
      pageStart: number;
      pageEnd: number;
    }
  | {
      code: "ungrounded_topic";
      title: string;
      fileIndex: number;
      pageStart: number;
      pageEnd: number;
    }
  | { code: "diger_bucket"; title: string };

export type OneShotValidationOptions = {
  /** Highest valid page number per file, indexed by 0-based file index. */
  filePageCounts: number[];
  pageTexts?: PageTextMap;
};

export type OneShotValidationTarget =
  | number
  | { fileIndex: number; maxPage: number }[]
  | OneShotValidationOptions;

export type OneShotValidationResult =
  | { ok: true; normalized: OutlineUnitDraft[]; dropped: OneShotValidationIssue[] }
  | { ok: false; issues: OneShotValidationIssue[] };

function resolveValidationTarget(
  target: OneShotValidationTarget,
  pageTexts?: PageTextMap,
): { filePageCounts: number[]; pageTexts?: PageTextMap } {
  if (typeof target === "number") {
    return { filePageCounts: [Math.max(1, target)], pageTexts };
  }
  if (Array.isArray(target)) {
    const counts: number[] = [];
    for (const entry of target) {
      counts[Math.max(0, entry.fileIndex)] = Math.max(1, entry.maxPage);
    }
    for (let i = 0; i < counts.length; i += 1) {
      if (!counts[i]) counts[i] = 1;
    }
    return { filePageCounts: counts.length ? counts : [1], pageTexts };
  }
  const counts = target.filePageCounts.length ? target.filePageCounts.slice() : [1];
  return { filePageCounts: counts, pageTexts: target.pageTexts ?? pageTexts };
}

/**
 * Drop what is provably wrong, keep the rest. A single hallucinated topic must
 * not throw away a book's worth of correct ones — only an outline that keeps
 * nothing is a failure worth escalating.
 */
export function validateOneShotOutline(
  draft: OneShotOutlineDraft,
  target: OneShotValidationTarget,
  pageTexts?: PageTextMap,
): OneShotValidationResult {
  const resolved = resolveValidationTarget(target, pageTexts);
  const filePageCounts = resolved.filePageCounts;
  const groundingFor = groundingIndex(resolved.pageTexts);
  const singleFile = filePageCounts.length === 1;

  const issues: OneShotValidationIssue[] = [];
  const units = draft.units.slice(0, MAX_UNITS);
  if (draft.units.length > MAX_UNITS) {
    issues.push({ code: "unit_count", units: draft.units.length });
  }

  const seen = new Set<string>();
  const idToTitle = new Map<string, string>();
  let autoId = 0;
  for (const unit of draft.units) {
    for (const topic of unit.topics) {
      const title = topic.title.trim();
      if (!title) continue;
      const id = (topic.id?.trim() || `t${++autoId}`).slice(0, MAX_ID_CHARS);
      if (!idToTitle.has(id)) idToTitle.set(id, title);
    }
  }

  const normalized: OutlineUnitDraft[] = [];
  let kept = 0;

  for (const unit of units) {
    const unitTitle = unit.title.trim();
    if (!unitTitle) {
      issues.push({ code: "empty_title" });
      continue;
    }
    if (/^di[gğ]er\s+konular$/i.test(unitTitle)) {
      issues.push({ code: "diger_bucket", title: unitTitle });
      continue;
    }
    const topics: OutlineUnitDraft["topics"] = [];
    for (const topic of unit.topics) {
      if (kept >= MAX_TOPICS_TOTAL) {
        issues.push({ code: "topic_count", topics: MAX_TOPICS_TOTAL + 1 });
        break;
      }
      const title = topic.title.trim();
      if (!title) {
        issues.push({ code: "empty_title" });
        continue;
      }
      if (/^di[gğ]er\s+konular$/i.test(title)) {
        issues.push({ code: "diger_bucket", title });
        continue;
      }
      const key = title.toLocaleLowerCase("tr");
      if (seen.has(key)) {
        issues.push({ code: "duplicate_topic", title });
        continue;
      }

      const rawFileIndex = Math.trunc(topic.fileIndex ?? 0);
      const fileIndex = singleFile ? 0 : rawFileIndex;
      const maxPage = filePageCounts[fileIndex];
      let start = Math.min(topic.pageStart, topic.pageEnd);
      let end = Math.max(topic.pageStart, topic.pageEnd);
      if (
        maxPage === undefined ||
        fileIndex < 0 ||
        start < 1 ||
        end > maxPage ||
        !Number.isFinite(start) ||
        !Number.isFinite(end)
      ) {
        issues.push({
          code: "page_range",
          title,
          fileIndex: rawFileIndex,
          pageStart: topic.pageStart,
          pageEnd: topic.pageEnd,
        });
        continue;
      }
      start = Math.max(1, Math.min(start, maxPage));
      end = Math.max(start, Math.min(end, maxPage));

      const why =
        (topic.whyLearn || topic.description || "").trim().slice(0, MAX_TEXT_CHARS) ||
        undefined;
      const likelyAsked = [
        ...new Set((topic.likelyAsked ?? []).map((s) => s.trim()).filter(Boolean)),
      ].slice(0, MAX_LIKELY_ASKED);

      const grounding = groundingFor(fileIndex);
      if (grounding && !groundTopic(grounding, { title, pageStart: start, pageEnd: end }).grounded) {
        issues.push({
          code: "ungrounded_topic",
          title,
          fileIndex,
          pageStart: start,
          pageEnd: end,
        });
        continue;
      }

      seen.add(key);
      kept += 1;
      const pageNumbers: number[] = [];
      for (let p = start; p <= end; p += 1) pageNumbers.push(p);
      const prerequisiteTitles = [
        ...new Set(
          (topic.prerequisiteIds ?? [])
            .map((id) => idToTitle.get(id.trim()) ?? "")
            .filter((t) => t && t.toLocaleLowerCase("tr") !== key),
        ),
      ].slice(0, MAX_PREREQS);
      topics.push({
        id: topic.id?.trim() || undefined,
        title,
        sourceTitles: [title],
        fileIndex,
        pageNumbers,
        description: why,
        whyLearn: why,
        examWeight: topic.examWeight ?? "medium",
        likelyAsked,
        prerequisiteIds: topic.prerequisiteIds ?? [],
        prerequisiteTitles,
      });
    }
    if (!topics.length) {
      issues.push({ code: "empty_unit", title: unitTitle });
      continue;
    }
    normalized.push({
      title: unitTitle,
      examWeight: unit.examWeight ?? "medium",
      topics,
    });
  }

  if (!kept) {
    issues.push({ code: "unit_count", units: 0 });
    return { ok: false, issues };
  }
  return { ok: true, normalized, dropped: issues };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function clampText(value: unknown, max: number): string {
  return asText(value).replace(/\s+/g, " ").trim().slice(0, max).trim();
}

function clampList(value: unknown, max: number, itemMax: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (out.length >= max) break;
    const text = clampText(item, itemMax);
    if (!text) continue;
    out.push(text);
  }
  return out;
}

function asInteger(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number.parseInt(asText(value), 10);
  if (!Number.isFinite(n)) return undefined;
  return Math.trunc(n);
}

function asWeight(value: unknown): "high" | "medium" | "low" {
  const text = asText(value).trim().toLowerCase();
  return text === "high" || text === "low" ? text : "medium";
}

/**
 * Soft trim before zod. A 130-character title or a fifth likelyAsked item is a
 * formatting slip, not a reason to throw away the whole map and pay for
 * another call — cut it down to the schema and let validation judge content.
 */
export function trimOneShotDraft(raw: unknown): { units: Record<string, unknown>[] } {
  const root = asRecord(raw);
  const rawUnits = Array.isArray(root?.units) ? (root.units as unknown[]) : [];
  const units: Record<string, unknown>[] = [];
  let totalTopics = 0;

  for (const rawUnit of rawUnits) {
    if (units.length >= MAX_UNITS) break;
    if (totalTopics >= MAX_TOPICS_TOTAL) break;
    const unit = asRecord(rawUnit);
    if (!unit) continue;
    const unitTitle = clampText(unit.title, MAX_TITLE_CHARS);
    if (!unitTitle) continue;

    const rawTopics = Array.isArray(unit.topics) ? (unit.topics as unknown[]) : [];
    const topics: Record<string, unknown>[] = [];
    for (const rawTopic of rawTopics) {
      if (topics.length >= MAX_TOPICS_PER_UNIT) break;
      if (totalTopics >= MAX_TOPICS_TOTAL) break;
      const topic = asRecord(rawTopic);
      if (!topic) continue;
      const title = clampText(topic.title, MAX_TITLE_CHARS);
      if (!title) continue;
      const pageStart = asInteger(topic.pageStart);
      const pageEnd = asInteger(topic.pageEnd) ?? pageStart;
      if (pageStart === undefined || pageEnd === undefined) continue;
      const id = clampText(topic.id, MAX_ID_CHARS);
      topics.push({
        ...(id ? { id } : {}),
        title,
        description: clampText(topic.description, MAX_TEXT_CHARS),
        whyLearn: clampText(topic.whyLearn, MAX_TEXT_CHARS),
        fileIndex: Math.max(0, asInteger(topic.fileIndex) ?? 0),
        pageStart: Math.max(1, pageStart),
        pageEnd: Math.max(1, pageEnd),
        examWeight: asWeight(topic.examWeight),
        likelyAsked: clampList(topic.likelyAsked, MAX_LIKELY_ASKED, MAX_LIKELY_ASKED_CHARS),
        prerequisiteIds: clampList(topic.prerequisiteIds, MAX_PREREQS, MAX_ID_CHARS),
      });
      totalTopics += 1;
    }
    if (!topics.length) continue;
    units.push({ title: unitTitle, examWeight: asWeight(unit.examWeight), topics });
  }

  return { units };
}

function examContextLine(examLabel?: string | null, examDate?: string | null): string {
  const parts: string[] = [];
  if (examLabel?.trim()) parts.push(examLabel.trim());
  if (examDate?.trim()) parts.push(examDate.trim());
  if (!parts.length) return "bu sınava";
  return `"${parts.join(" / ")}" sınavına`;
}

export function fileGuideBlock(files: { fileName: string }[], bounds: number[]): string {
  if (!files.length) return "";
  const lines = files.map((file, index) => {
    const maxPage = bounds[index] ?? 1;
    return `- d${index + 1} = ${file.fileName} (sayfa 1–${maxPage}, fileIndex: ${index})`;
  });
  return `Dosyalar:\n${lines.join("\n")}`;
}

function previousOutlineBlock(previous?: OutlineUnitDraft[]): string {
  if (!previous?.length) return "";
  const summary = previous
    .map((unit) => `- ${unit.title}: ${unit.topics.map((t) => t.title).join("; ")}`)
    .join("\n");
  return `\n\nHAZIRLIKTA ZATEN OLAN KONULAR:\n${summary}\n\nBu materyal aynı derse eklenen yeni bir dosya. Yeni dosyada zaten olan bir konu geçiyorsa AYNI ADI kullan; yalnızca bu dosyada gerçekten bulunan konuları yaz. Sayfa aralıkları bu dosyanın [d? s.N] işaretlerinden gelmeli.`;
}

function tocBlockSection(tocBlock?: string | null): string {
  const text = tocBlock?.trim();
  if (!text) return "";
  return `\n\nKitabın kendi yapısı (içindekiler — başlık adlandırmasında buna uy, ama sayfa numaralarını [d? s.N] işaretlerinden doğrula):\n${text.slice(0, 6_000)}`;
}

function repairBlock(repairErrors?: string, invalidDraftJson?: string): string {
  if (!repairErrors && !invalidDraftJson) return "";
  const draftPart = invalidDraftJson
    ? `\n\nGeçersiz çıktın (aynen):\n${invalidDraftJson.slice(0, 40_000)}`
    : "";
  const issuePart = repairErrors ? `\n\nDüzeltmen gerekenler:\n${repairErrors}` : "";
  return `\n\nÖnceki çıktı geçersizdi.${draftPart}${issuePart}\n\nAşağıdaki sayfa metni YALNIZCA bu konuların alıntıladığı sayfalardır. Her konuyu bu metinle doğrula: doğrulayamadığını sil, sayfa aralığını düzelt, uydurma ekleme. Yeniden üret.`;
}

function studentOutlinePrompt(input: {
  examLabel?: string | null;
  examDate?: string | null;
  corpus: string;
  fileGuide: string;
  maxPage: number;
  tocBlock?: string | null;
  previousOutline?: OutlineUnitDraft[];
  repairErrors?: string;
  invalidDraftJson?: string;
}): string {
  const exam = examContextLine(input.examLabel, input.examDate);
  const guide = input.fileGuide ? `\n\n${input.fileGuide}` : "";
  return `Bu materyalle ${exam} hazırlanıyorsun. Tek JSON çıktıda İKİ bakış açısını birlikte kodla.${guide}

1) ÖĞRETMEN bakışı (sınav türü/seviyesi: ${input.examLabel?.trim() || "genel"}):
- Bu sınavda ne sorulması olası?
- Her ünite ve konu için examWeight: "high" | "medium" | "low".
- Her konu için likelyAsked: 2–4 kısa madde (sinavda_sorulabilecekler). Her madde alıntılanan sayfalardaki metne dayanmalı.

2) ÖĞRENCİ bakışı:
- Bu içeriği en iyi nasıl anlarım, hangi sırayla çalışırım?
- Ünite/konu sırasını öğrenme sırasına koy (önkoşullar önce; kitap sırasından farklı olabilir).
- Konuları öğrencinin çalışacağı gibi grupla.
- Her konu için whyLearn: tek cümle (ne öğreneceğim / neden önemli).
- Her konuya kısa id ver (ör. "t1") ve prerequisiteIds ile önceki konu id'lerini bağla.

SERT KURAL — UYDURMA YOK:
- Yalnızca verilen materyali kullan. Materyalde olmayan konu, madde veya sayfa ekleme.
- Her konu ve her likelyAsked maddesi, fileIndex + pageStart–pageEnd aralığındaki [d? s.N] metniyle desteklenmeli.
- Materyal bir şeyi kapsamıyorsa onu ekleme.
- Sayfa işaretleri [d1 s.12] biçimindedir: d1 = birinci dosya (fileIndex 0), d2 = ikinci dosya (fileIndex 1). Konunun fileIndex'i alıntıladığın işaretle aynı dosyayı göstermeli.
- pageStart/pageEnd gerçek [d? s.N] işaretlerinden; o dosyanın sayfa aralığı dışında numara uydurma (en fazla ${input.maxPage}).
- Sayfa aralığını dar tut: bir konu 8 sayfadan genişse gerçekten o sayfaların tamamını kapsamalı.
- Kitabın/dosyaların kendi yapısını (içindekiler, bölüm başlıkları) dikkate al ama logolar, seri adları, sayfa üstbilgileri, soru numaraları, şıklar, OCR bozukluklarını konu yapma.
- "Diğer Konular" kovası EKLEME. Ünite 1–${MAX_UNITS}, toplam konu ≤${MAX_TOPICS_TOTAL}.

JSON: {"units":[{"title":string,"examWeight":"high|medium|low","topics":[{"id":string,"title":string,"whyLearn":string,"description":string,"fileIndex":number,"pageStart":number,"pageEnd":number,"examWeight":"high|medium|low","likelyAsked":string[],"prerequisiteIds":string[]}]}]}${tocBlockSection(input.tocBlock)}${previousOutlineBlock(input.previousOutline)}

Materyal:
${input.corpus}${repairBlock(input.repairErrors, input.invalidDraftJson)}`;
}

const SCHEMA_HINT =
  'JSON: {"units":[{"title":string,"examWeight":"high|medium|low","topics":[{"id":string,"title":string,"whyLearn":string,"description":string,"fileIndex":number,"pageStart":number,"pageEnd":number,"examWeight":"high|medium|low","likelyAsked":string[2-4],"prerequisiteIds":string[]}]}]}. ' +
  `Öğretmen+öğrenci bakışı. Uydurma yok — her konu alıntılanan sayfa metnine dayanır. fileIndex 0 tabanlı (d1→0). 1–${MAX_UNITS} ünite, ≤${MAX_TOPICS_TOTAL} konu. Diğer Konular yok. Öğrenme sırası (önkoşul önce).`;

type OutlinePromptInput = {
  examLabel?: string | null;
  examDate?: string | null;
  tocBlock?: string | null;
  previousOutline?: OutlineUnitDraft[];
};

export type OutlineCallResult = {
  draft: OneShotOutlineDraft | null;
  /** Pending (deferred) reservation of a parsed draft — commit only if kept. */
  reservationId?: string;
  /** generateJson error when there is no draft (deadline, stalled, …). */
  error?: string;
  model: string;
};

async function callOutlineModel(input: OutlinePromptInput & {
  service: SupabaseClient;
  userId: string;
  corpus: string;
  fileGuide: string;
  maxPage: number;
  model: string;
  idempotencyKey: string;
  deadlineAt: number;
  repairErrors?: string;
  invalidDraftJson?: string;
}): Promise<OutlineCallResult> {
  try {
    const generated = await generateJson({
      service: input.service,
      userId: input.userId,
      actionCode: "STUDY_PLAN_GENERATE",
      isPremium: await isPremiumUser(input.service, input.userId),
      verificationMode: "schema",
      deadlineAt: input.deadlineAt,
      maxDraftAttempts: 1,
      modelOverride: input.model,
      callTimeoutMs: OUTLINE_CALL_TIMEOUT_MS,
      stream: true,
      maxTransientAttempts: OUTLINE_TRANSIENT_ATTEMPTS,
      idempotencyKey: input.idempotencyKey,
      // Charged only when the draft ends up in the saved map.
      deferCommit: true,
      responseFormat: {
        type: "json_schema",
        json_schema: { name: "study_outline", strict: true, schema: oneShotJsonSchema },
      },
      schemaHint: SCHEMA_HINT,
      userPrompt: studentOutlinePrompt({
        examLabel: input.examLabel,
        examDate: input.examDate,
        corpus: input.corpus,
        fileGuide: input.fileGuide,
        maxPage: input.maxPage,
        tocBlock: input.tocBlock,
        previousOutline: input.previousOutline,
        repairErrors: input.repairErrors,
        invalidDraftJson: input.invalidDraftJson,
      }),
      parse: (raw) => {
        const parsed = oneShotOutlineSchema.safeParse(trimOneShotDraft(raw));
        return parsed.success ? parsed.data : null;
      },
    });
    if (generated.ok && generated.data) {
      return { draft: generated.data, reservationId: generated.reservationId, model: input.model };
    }
    return { draft: null, error: generated.ok ? "empty" : generated.error, model: input.model };
  } catch {
    return { draft: null, error: "generation_failed", model: input.model };
  }
}

export function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/**
 * Time a call needs, from its input size (~3 chars per token). A call is only
 * started when the round has at least this much left; otherwise the stage is
 * checkpointed and the next round starts it with a full budget.
 */
export function estimateOutlineCallMs(promptChars: number): number {
  const tokens = promptChars / 3;
  if (tokens <= 15_000) return 60_000;
  if (tokens <= 60_000) return 100_000;
  if (tokens <= 200_000) return 150_000;
  return 200_000;
}

/** Everything about the course material the outline stages need. */
export type OutlineMaterial = {
  files: MaterialFileCorpus[];
  corpus: string;
  bounds: number[];
  maxPage: number;
  /** Pages summed across every file — routing reads this, not one file. */
  pageCount: number;
  fileGuide: string;
  validation: OneShotValidationOptions;
  routed: OutlineModelChoice;
  /** Huge corpus → parallel parts on file/page boundaries, then one merge. */
  parts: MaterialFileCorpus[][] | null;
  contentHash: string;
};

export function prepareOutlineMaterial(input: MaterialFileCorpus[]): OutlineMaterial {
  const files = input.map((file, fileIndex) => ({ ...file, fileIndex }));
  const corpus = buildMaterialCorpus(files);
  const bounds = filePageBounds(files);
  const pageCount = files.reduce((total, file) => total + file.pages.length, 0);
  const split = needsForceSplit({ pageCount, corpusChars: corpus.length });
  const parts = split ? splitFilesForOutline(files) : null;
  return {
    files,
    corpus,
    bounds,
    maxPage: Math.max(1, ...bounds),
    pageCount,
    fileGuide: fileGuideBlock(files, bounds),
    validation: { filePageCounts: bounds, pageTexts: pageTextMapFromFiles(files) },
    routed: selectOutlineModel({ pageCount, corpusChars: corpus.length }),
    parts: parts && parts.length > 1 ? parts : null,
    contentHash: fnv1a(corpus),
  };
}

export type OutlineStage = "first" | "escalate" | "repair" | "fallback" | "merge";

/** A validated map candidate and the reservations that produced it. */
export type OutlineCandidate = {
  units: OutlineUnitDraft[];
  kept: number;
  proposed: number;
  dropped: number;
  model: string;
  reservationIds: string[];
};

/** Serializable progress between rounds (lives in the job meta). */
export type OutlineProgress = {
  stage: OutlineStage;
  /** Last draft, for the repair stage (sent back with its errors). */
  draft?: OneShotOutlineDraft;
  draftModel?: string;
  /** Best usable map so far; kept if a later stage does worse. */
  best?: OutlineCandidate;
  /** Force-split part drafts (null = still to do). */
  parts?: ({ draft: OneShotOutlineDraft; reservationId?: string } | null)[];
  /** Repair runs on the fallback model when the strong model is down. */
  viaFallback?: boolean;
};

export type OutlineStepResult =
  | {
      kind: "done";
      map: OutlineCandidate;
      /** Stage that produced the kept map ("kept" = an earlier, better draft). */
      path: OutlineStage | "kept";
      /** Refund now: parsed drafts that are not part of the kept map. */
      release: string[];
    }
  | { kind: "continue"; progress: OutlineProgress; release: string[]; failed: boolean }
  | { kind: "wait"; needMs: number }
  | { kind: "blocked"; error: string; release: string[] }
  /**
   * No usable map. "rejected": our validation turned down every draft of this
   * cycle — final for this attempt. "provider": the model never answered.
   */
  | { kind: "exhausted"; release: string[]; reason: "rejected" | "provider" };

function draftTopicCount(draft: OneShotOutlineDraft): number {
  return draft.units.reduce((n, unit) => n + unit.topics.length, 0);
}

function candidateFrom(
  draft: OneShotOutlineDraft,
  validation: OneShotValidationOptions,
  model: string,
  reservationIds: string[],
): { candidate: OutlineCandidate | null; issues: OneShotValidationIssue[] } {
  const result = validateOneShotOutline(draft, validation);
  if (!result.ok) return { candidate: null, issues: result.issues };
  const kept = result.normalized.reduce((n, unit) => n + unit.topics.length, 0);
  return {
    candidate: {
      units: result.normalized,
      kept,
      proposed: draftTopicCount(draft),
      dropped: result.dropped.length,
      model,
      reservationIds,
    },
    issues: result.dropped,
  };
}

/** Kept at least two thirds of what the model proposed. */
function goodEnough(candidate: OutlineCandidate | null): candidate is OutlineCandidate {
  return Boolean(candidate && candidate.kept * 3 >= candidate.proposed * 2);
}

function better(a: OutlineCandidate | undefined, b: OutlineCandidate | null | undefined) {
  if (!a) return b ?? undefined;
  if (!b) return a;
  return b.kept >= a.kept ? b : a;
}

function reservationsOf(candidate: OutlineCandidate | undefined | null): string[] {
  return candidate?.reservationIds ?? [];
}

/** The key that makes a retry of the same call reuse its reservation. */
export type OutlineKeyFor = (stage: OutlineStage, part?: number) => string;

/** Credits bookkeeping errors: re-key and retry, never switch models. */
const BOOKKEEPING_ERRORS = new Set(["operation_completed", "operation_in_progress"]);
const BLOCKING_ERRORS = new Set(["insufficient_credits", "ai_not_configured"]);

/**
 * Run exactly ONE outline stage — one long model call, or the parallel parts
 * of a huge corpus. The caller persists `progress` and calls again in the
 * next round, so a round never chains two long calls.
 *
 * first     → routed model (≤30 pages mini, else gpt-4.1) over the whole corpus
 * escalate  → gpt-4.1 when mini's draft is rejected or mini returned nothing
 * repair    → one targeted pass over the cited pages when gpt-4.1 drops too much
 * fallback  → only when gpt-4.1 itself fails at provider level
 * merge     → one call over the part outlines (huge corpora only)
 */
export async function runOutlineStep(input: OutlinePromptInput & {
  service: SupabaseClient;
  userId: string;
  material: OutlineMaterial;
  progress: OutlineProgress;
  keyFor: OutlineKeyFor;
  deadlineAt: number;
  /** Called with the idempotency keys right before the model is called. */
  onCallStart?: (keys: string[]) => Promise<void>;
  now?: () => number;
}): Promise<OutlineStepResult> {
  const now = input.now ?? Date.now;
  const { material, progress } = input;
  const strong = outlineStrongModel();
  const fallback = outlineFallbackModel();
  const prompt = {
    service: input.service,
    userId: input.userId,
    fileGuide: material.fileGuide,
    maxPage: material.maxPage,
    examLabel: input.examLabel,
    examDate: input.examDate,
    tocBlock: input.tocBlock,
    previousOutline: input.previousOutline,
    deadlineAt: input.deadlineAt,
  };
  const fits = (chars: number) => {
    const needMs = estimateOutlineCallMs(chars + 6_000);
    return input.deadlineAt - now() >= needMs ? null : needMs;
  };
  const best = progress.best;
  const failWith = (error: string | undefined, next: OutlineProgress): OutlineStepResult => {
    if (error && BLOCKING_ERRORS.has(error)) {
      return { kind: "blocked", error, release: reservationsOf(best) };
    }
    return { kind: "continue", progress: next, release: [], failed: true };
  };

  // ——— Huge corpus: parallel parts, then a merge in the next round ———
  if (progress.stage === "first" && material.parts) {
    const parts = material.parts;
    const done = parts.map((_, i) => progress.parts?.[i] ?? null);
    const todo = parts.map((_, i) => i).filter((i) => !done[i]);
    const corpora = parts.map((files) => buildMaterialCorpus(files));
    const needMs = fits(Math.max(0, ...todo.map((i) => corpora[i]!.length)));
    if (needMs) return { kind: "wait", needMs };
    await input.onCallStart?.(todo.map((i) => input.keyFor("first", i + 1)));
    const results = await Promise.all(
      todo.map((i) =>
        callOutlineModel({
          ...prompt,
          corpus: `--- Parça ${i + 1}/${parts.length} ---\n${corpora[i]}`,
          model: strong,
          idempotencyKey: input.keyFor("first", i + 1),
        }),
      ),
    );
    let error: string | undefined;
    todo.forEach((partIndex, j) => {
      const result = results[j]!;
      if (result.draft) done[partIndex] = { draft: result.draft, reservationId: result.reservationId };
      else error ??= result.error;
    });
    if (done.every(Boolean)) {
      return { kind: "continue", progress: { stage: "merge", parts: done }, release: [], failed: false };
    }
    return failWith(error, { stage: "first", parts: done });
  }

  if (progress.stage === "merge") {
    const parts = progress.parts ?? [];
    if (!parts.length || parts.some((p) => !p)) {
      return { kind: "continue", progress: { stage: "first", parts }, release: [], failed: false };
    }
    const mergeCorpus = parts
      .map((p, i) => `=== Kısmi taslak ${i + 1} ===\n${JSON.stringify(p!.draft)}`)
      .join("\n");
    const corpus = `Aşağıdaki kısmi ünite/konu taslaklarını tek bir bütün çalışma yolunda birleştir. Metni yeniden okuma; yalnızca taslakları birleştir, yinele, sıraya koy. fileIndex ve sayfa aralıklarını taslaklardaki gibi koru. Uydurma ekleme.\n\n${mergeCorpus}`;
    const needMs = fits(corpus.length);
    if (needMs) return { kind: "wait", needMs };
    await input.onCallStart?.([input.keyFor("merge")]);
    const merged = await callOutlineModel({ ...prompt, corpus, model: strong, idempotencyKey: input.keyFor("merge") });
    if (!merged.draft) return failWith(merged.error, progress);
    const partReservations = parts.flatMap((p) => (p?.reservationId ? [p.reservationId] : []));
    const { candidate } = candidateFrom(merged.draft, material.validation, strong, [
      ...partReservations,
      ...(merged.reservationId ? [merged.reservationId] : []),
    ]);
    if (goodEnough(candidate)) return { kind: "done", map: candidate, path: "merge", release: [] };
    return {
      kind: "continue",
      progress: { stage: "repair", draft: merged.draft, draftModel: strong, best: candidate ?? undefined },
      // Parts stay held with the merge only when the merge is kept.
      release: candidate ? [] : [...partReservations, ...(merged.reservationId ? [merged.reservationId] : [])],
      failed: false,
    };
  }

  // ——— Repair: one pass over the cited pages only ———
  if (progress.stage === "repair") {
    const draft = progress.draft;
    if (!draft) {
      return best
        ? { kind: "done", map: best, path: "kept", release: [] }
        : { kind: "exhausted", release: [], reason: "rejected" };
    }
    const { issues } = candidateFrom(draft, material.validation, progress.draftModel ?? strong, []);
    const cited = buildCitedPagesCorpus(
      material.files,
      citedRefsFromDraft(draft, material.files.length === 1),
    );
    const corpus = (cited || material.corpus).slice(0, ONESHOT_STRONG_MAX_CHARS);
    const needMs = fits(corpus.length + JSON.stringify(draft).length);
    if (needMs) return { kind: "wait", needMs };
    const model = progress.viaFallback ? fallback : strong;
    await input.onCallStart?.([input.keyFor("repair")]);
    const repaired = await callOutlineModel({
      ...prompt,
      corpus,
      model,
      idempotencyKey: input.keyFor("repair"),
      repairErrors: issues.map((issue) => JSON.stringify(issue)).join("\n") || "Konuların çoğu alıntılanan sayfalarda doğrulanamadı.",
      invalidDraftJson: JSON.stringify(draft),
    });
    const fixed = repaired.draft
      ? candidateFrom(repaired.draft, material.validation, model, repaired.reservationId ? [repaired.reservationId] : []).candidate
      : null;
    const chosen = better(best, fixed);
    if (!chosen) {
      return {
        kind: "exhausted",
        release: repaired.reservationId ? [repaired.reservationId] : [],
        // The repair only runs after a draft was rejected by validation.
        reason: "rejected",
      };
    }
    const loser = chosen === best ? fixed : best;
    const release = [
      ...reservationsOf(loser),
      ...(!fixed && repaired.reservationId ? [repaired.reservationId] : []),
    ];
    return { kind: "done", map: chosen, path: chosen === fixed ? "repair" : "kept", release };
  }

  // ——— first / escalate / fallback: one call over the whole corpus ———
  const model =
    progress.stage === "first" ? material.routed.model : progress.stage === "escalate" ? strong : fallback;
  const corpus =
    material.corpus.length > ONESHOT_STRONG_MAX_CHARS
      ? material.corpus.slice(0, ONESHOT_STRONG_MAX_CHARS)
      : material.corpus;
  const needMs = fits(corpus.length);
  if (needMs) return { kind: "wait", needMs };
  const key = input.keyFor(progress.stage);
  await input.onCallStart?.([key]);
  const call = await callOutlineModel({ ...prompt, corpus, model, idempotencyKey: key });
  const isMini = progress.stage === "first" && material.routed.tier === "standard";

  if (!call.draft) {
    if (call.error && BLOCKING_ERRORS.has(call.error)) return failWith(call.error, progress);
    // Credits bookkeeping or our own deadline: same stage next round, new key.
    if (call.error === "deadline" || (call.error && BOOKKEEPING_ERRORS.has(call.error))) {
      return { kind: "continue", progress, release: [], failed: true };
    }
    if (isMini) return failWith(call.error, { ...progress, stage: "escalate" });
    if (progress.stage !== "fallback" && fallback !== strong) {
      return failWith(call.error, { ...progress, stage: "fallback" });
    }
    if (best) return { kind: "done", map: best, path: "kept", release: [] };
    return { kind: "exhausted", release: [], reason: "provider" };
  }

  const { candidate } = candidateFrom(
    call.draft,
    material.validation,
    model,
    call.reservationId ? [call.reservationId] : [],
  );
  if (goodEnough(candidate)) {
    return { kind: "done", map: candidate, path: progress.stage, release: reservationsOf(best) };
  }
  const nextBest = better(best, candidate);
  const release = [
    ...(nextBest === best ? reservationsOf(candidate) : reservationsOf(best)),
    ...(!candidate && call.reservationId ? [call.reservationId] : []),
  ];
  if (isMini) {
    return { kind: "continue", progress: { stage: "escalate", best: nextBest }, release, failed: false };
  }
  return {
    kind: "continue",
    progress: {
      stage: "repair",
      draft: call.draft,
      draftModel: model,
      best: nextBest,
      viaFallback: progress.stage === "fallback",
    },
    release,
    failed: false,
  };
}

function citedRefsFromDraft(
  draft: OneShotOutlineDraft,
  singleFile: boolean,
): { fileIndex: number; pageStart: number; pageEnd: number }[] {
  return draft.units.flatMap((unit) =>
    unit.topics.map((topic) => ({
      fileIndex: singleFile ? 0 : Math.max(0, Math.trunc(topic.fileIndex ?? 0)),
      pageStart: topic.pageStart,
      pageEnd: topic.pageEnd,
    })),
  );
}
