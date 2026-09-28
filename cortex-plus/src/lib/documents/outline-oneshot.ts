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
import { foldTr, type PageAnalysis } from "@/lib/documents/page-analysis";

/** Soft page threshold for the cheaper outline model. */
export const OUTLINE_MINI_PAGE_LIMIT = 30;
/** ~100k tokens — stay under mini context with prompt margin. */
export const ONESHOT_MAX_INPUT_CHARS = 280_000;
/** gpt-4.1 1M context — whole-book corpus without splitting. */
export const ONESHOT_STRONG_MAX_CHARS = 2_500_000;
/** Split into at most this many parallel parts (mini path only). */
export const ONESHOT_MAX_PARTS = 3;
/** A whole book in one call needs far more than the 90s default. */
export const OUTLINE_CALL_TIMEOUT_MS = 240_000;

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

export type OneShotOutlineResult = {
  units: OutlineUnitDraft[];
  fromModel: boolean;
  path: "single" | "split_merge" | "repair" | "escalation" | "failed";
  /** True when the student should retry — never invent a fake map. */
  retryable: boolean;
  model?: string;
  /** Topics the validator silently dropped from an otherwise usable map. */
  droppedTopics?: number;
};

export type MaterialFileCorpus = {
  fileName: string;
  pages: { pageNumber: number; text: string }[];
};

/** Page text lookup key — pages repeat across files, page numbers do not. */
export function pageKey(fileIndex: number, page: number): string {
  return `${fileIndex}:${page}`;
}

/** Number keys are the legacy single-file form and still resolve. */
export type PageTextMap = Map<string, string> | Map<number, string>;

function readPageText(
  map: PageTextMap | undefined,
  fileIndex: number,
  page: number,
): string {
  if (!map) return "";
  const lookup = map as Map<string | number, string>;
  const byKey = lookup.get(pageKey(fileIndex, page));
  if (byKey !== undefined) return byKey;
  if (fileIndex === 0) return lookup.get(page) ?? "";
  return "";
}

export function buildMaterialCorpus(files: MaterialFileCorpus[]): string {
  const parts: string[] = [];
  files.forEach((file, fileIndex) => {
    const label = `d${fileIndex + 1}`;
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
    const fileIndex = files.length === 1 ? 0 : ref.fileIndex;
    if (fileIndex < 0 || fileIndex >= files.length) continue;
    const start = Math.max(1, Math.min(ref.pageStart, ref.pageEnd));
    const end = Math.max(ref.pageStart, ref.pageEnd);
    const set = wanted.get(fileIndex) ?? new Set<number>();
    for (let p = start; p <= end && p - start < 200; p += 1) set.add(p);
    wanted.set(fileIndex, set);
  }
  if (!wanted.size) return "";
  const parts: string[] = [];
  files.forEach((file, fileIndex) => {
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
  files.forEach((file, fileIndex) => {
    for (const page of file.pages) {
      const key = pageKey(fileIndex, page.pageNumber);
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

/** Split on file/page boundaries when corpus exceeds the mini budget. */
export function splitCorpusForContext(
  corpus: string,
  maxChars = ONESHOT_MAX_INPUT_CHARS,
): string[] {
  if (corpus.length <= maxChars) return [corpus];
  const lines = corpus.split("\n");
  const parts: string[] = [];
  let buf: string[] = [];
  let size = 0;
  const flush = () => {
    if (!buf.length) return;
    parts.push(buf.join("\n"));
    buf = [];
    size = 0;
  };
  for (const line of lines) {
    const add = line.length + 1;
    if (size + add > maxChars && buf.length) flush();
    buf.push(line);
    size += add;
    if (parts.length >= ONESHOT_MAX_PARTS - 1 && size >= maxChars * 0.9) {
      continue;
    }
  }
  flush();
  if (parts.length > ONESHOT_MAX_PARTS) {
    const head = parts.slice(0, ONESHOT_MAX_PARTS - 1);
    const tail = parts.slice(ONESHOT_MAX_PARTS - 1).join("\n");
    return [...head, tail];
  }
  return parts.length ? parts : [corpus.slice(0, maxChars)];
}

const TR_STOP = new Set([
  "ve",
  "bir",
  "icin",
  "için",
  "olan",
  "ile",
  "da",
  "de",
  "mi",
  "mu",
  "mı",
  "bu",
  "su",
  "şu",
  "olarak",
  "gibi",
  "kadar",
  "ancak",
  "veya",
  "ise",
  "ki",
  "ne",
  "degil",
  "değil",
  "the",
  "and",
  "of",
  "to",
  "in",
  "for",
  "with",
  "is",
  "are",
  "a",
  "an",
]);

/**
 * Light Turkish suffix list, applied after `foldTr` (so ı→i, ü→u already).
 * Not a real morphological analyser — just enough that "kaynaklarını" and
 * "kaynak" count as the same word when checking a topic against its pages.
 */
const TR_SUFFIXES = [
  "lerinden",
  "larindan",
  "lerinin",
  "larinin",
  "lerine",
  "larina",
  "lerini",
  "larini",
  "lerden",
  "lardan",
  "lerin",
  "larin",
  "lerde",
  "larda",
  "sinin",
  "sunun",
  "sini",
  "sunu",
  "leri",
  "lari",
  "ler",
  "lar",
  "nin",
  "nun",
  "den",
  "dan",
  "ten",
  "tan",
  "si",
  "su",
  "de",
  "da",
  "te",
  "ta",
  "in",
  "un",
  "im",
  "um",
  "ya",
  "ye",
  "yi",
  "yu",
  "i",
  "u",
  "e",
  "a",
].sort((a, b) => b.length - a.length);

const MIN_STEM_CHARS = 4;

/** Strip up to three Turkish inflection suffixes from an already folded token. */
export function stemOutlineToken(token: string): string {
  let out = token;
  for (let round = 0; round < 3; round += 1) {
    let changed = false;
    for (const suffix of TR_SUFFIXES) {
      if (out.length - suffix.length < MIN_STEM_CHARS) continue;
      if (!out.endsWith(suffix)) continue;
      out = out.slice(0, out.length - suffix.length);
      changed = true;
      break;
    }
    if (!changed) break;
  }
  return out;
}

/** Turkish-aware token set for grounding checks (no subject keyword lists). */
export function normalizeOutlineTokens(text: string): string[] {
  const folded = foldTr(text)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!folded) return [];
  const out: string[] = [];
  for (const raw of folded.split(" ")) {
    if (raw.length < 3) continue;
    if (TR_STOP.has(raw)) continue;
    if (/^\d+$/.test(raw)) continue;
    out.push(stemOutlineToken(raw));
  }
  return [...new Set(out)];
}

/** Beyond this span a couple of scattered word hits prove nothing. */
const WIDE_RANGE_PAGES = 8;
/** Share of topic tokens that must appear across a wide citation. */
const WIDE_RANGE_DENSITY = 0.25;
const NARROW_RANGE_DENSITY = 0.34;

export function topicTextGrounded(input: {
  title: string;
  whyLearn?: string | null;
  likelyAsked?: string[];
  fileIndex?: number;
  pageStart: number;
  pageEnd: number;
  pageTexts: PageTextMap;
}): boolean {
  const fileIndex = Math.max(0, input.fileIndex ?? 0);
  const start = Math.min(input.pageStart, input.pageEnd);
  const end = Math.max(input.pageStart, input.pageEnd);

  const perPage: Set<string>[] = [];
  const union = new Set<string>();
  for (let p = start; p <= end; p += 1) {
    const tokens = new Set(normalizeOutlineTokens(readPageText(input.pageTexts, fileIndex, p)));
    perPage.push(tokens);
    for (const t of tokens) union.add(t);
  }
  if (!union.size) return false;

  const topicBlob = [input.title, input.whyLearn ?? "", ...(input.likelyAsked ?? [])].join(" ");
  const topicTokens = normalizeOutlineTokens(topicBlob);
  if (!topicTokens.length) return false;

  const hit = topicTokens.filter((t) => union.has(t)).length;
  const need = Math.min(2, topicTokens.length);
  const density = hit / topicTokens.length;

  if (end - start + 1 > WIDE_RANGE_PAGES) {
    // A 40-page citation that only echoes two words scattered a book apart is
    // how fabricated topics slip through. Demand one page that really covers
    // the topic, or real coverage across the whole citation.
    const samePage = perPage.some(
      (tokens) => topicTokens.filter((t) => tokens.has(t)).length >= need,
    );
    return samePage || density >= WIDE_RANGE_DENSITY;
  }

  if (hit >= need) return true;
  return density >= NARROW_RANGE_DENSITY;
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
  const texts = resolved.pageTexts;
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

      if (
        texts &&
        !topicTextGrounded({
          title,
          whyLearn: why,
          likelyAsked,
          fileIndex,
          pageStart: start,
          pageEnd: end,
          pageTexts: texts,
        })
      ) {
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
    .map(
      (unit) =>
        `- ${unit.title}: ${unit.topics
          .map((t) => `${t.title} (s.${t.pageNumbers[0] ?? "?"})`)
          .join("; ")}`,
    )
    .join("\n");
  return `\n\nÖNCEKİ ÇALIŞMA YOLU (var olan harita):\n${summary}\n\nBunu GENİŞLET ve BİRLEŞTİR — var olan üniteleri/konuları atma, adlarını koru; eksik kalan yerleri ekle, sırayı düzelt. Var olan bir konuyu yalnızca materyalde karşılığı yoksa çıkar.`;
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

async function callOutlineModel(input: {
  service: SupabaseClient;
  userId: string;
  corpus: string;
  fileGuide: string;
  maxPage: number;
  model: string;
  idempotencyKey?: string;
  examLabel?: string | null;
  examDate?: string | null;
  deadlineAt?: number;
  tocBlock?: string | null;
  previousOutline?: OutlineUnitDraft[];
  repairErrors?: string;
  invalidDraftJson?: string;
}): Promise<OneShotOutlineDraft | null> {
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
      idempotencyKey: input.idempotencyKey,
      responseFormat: {
        type: "json_schema",
        json_schema: {
          name: "study_outline",
          strict: true,
          schema: oneShotJsonSchema,
        },
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
    if (generated.ok && generated.data) return generated.data;
  } catch {
    return null;
  }
  return null;
}

function failedResult(partial?: {
  path?: OneShotOutlineResult["path"];
  model?: string;
}): OneShotOutlineResult {
  return {
    units: [],
    fromModel: false,
    path: partial?.path ?? "failed",
    retryable: true,
    model: partial?.model,
  };
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/** Same material + same attempt kind must not reserve credits twice. */
export function outlineIdempotencyKey(input: {
  userId: string;
  files: { fileName: string }[];
  pageCount: number;
  attempt: "first" | "escalate" | "repair";
  suffix?: string;
}): string {
  const material = fnv1a(
    `${input.files.map((f) => f.fileName).join("|")}::${input.pageCount}`,
  );
  const tail = input.suffix ? `${input.attempt}:${input.suffix}` : input.attempt;
  return `outline:${input.userId}:${material}:${tail}`;
}

async function outlineWithModel(input: {
  service: SupabaseClient;
  userId: string;
  corpus: string;
  fileGuide: string;
  maxPage: number;
  model: string;
  tier: "standard" | "strong";
  idempotencyKeyFor: (suffix?: string) => string;
  examLabel?: string | null;
  examDate?: string | null;
  deadlineAt?: number;
  tocBlock?: string | null;
  previousOutline?: OutlineUnitDraft[];
}): Promise<{ draft: OneShotOutlineDraft | null; path: "single" | "split_merge" }> {
  const shared = {
    service: input.service,
    userId: input.userId,
    fileGuide: input.fileGuide,
    maxPage: input.maxPage,
    model: input.model,
    examLabel: input.examLabel,
    examDate: input.examDate,
    deadlineAt: input.deadlineAt,
    tocBlock: input.tocBlock,
    previousOutline: input.previousOutline,
  };

  // Strong model reads the whole material in one call (1M context).
  if (input.tier === "strong" || input.corpus.length <= ONESHOT_MAX_INPUT_CHARS) {
    const corpus =
      input.tier === "strong" && input.corpus.length > ONESHOT_STRONG_MAX_CHARS
        ? input.corpus.slice(0, ONESHOT_STRONG_MAX_CHARS)
        : input.corpus;
    const draft = await callOutlineModel({
      ...shared,
      corpus,
      idempotencyKey: input.idempotencyKeyFor(),
    });
    return { draft, path: "single" };
  }

  const parts = splitCorpusForContext(input.corpus);
  if (parts.length === 1) {
    const draft = await callOutlineModel({
      ...shared,
      corpus: parts[0]!,
      idempotencyKey: input.idempotencyKeyFor(),
    });
    return { draft, path: "single" };
  }

  const partials = await Promise.all(
    parts.map((part, index) =>
      callOutlineModel({
        ...shared,
        corpus: `--- Parça ${index + 1}/${parts.length} ---\n${part}`,
        idempotencyKey: input.idempotencyKeyFor(`part${index + 1}`),
      }),
    ),
  );
  if (partials.some((p) => !p)) {
    return { draft: null, path: "split_merge" };
  }
  const mergeCorpus = partials
    .map((p, i) => `=== Kısmi taslak ${i + 1} ===\n${JSON.stringify(p)}`)
    .join("\n");
  const draft = await callOutlineModel({
    ...shared,
    corpus: `Aşağıdaki kısmi ünite/konu taslaklarını tek bir bütün çalışma yolunda birleştir. Metni yeniden okuma; yalnızca taslakları birleştir, yinele, sıraya koy. Uydurma ekleme.\n\n${mergeCorpus}`,
    idempotencyKey: input.idempotencyKeyFor("merge"),
  });
  return { draft, path: "split_merge" };
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

/**
 * Whole-material outline. Prefer a single model call; split+merge only on mini
 * when the corpus exceeds the mini budget. Never invent a fake topic list.
 */
export async function buildOutlineOneShot(input: {
  service: SupabaseClient;
  userId: string;
  files: MaterialFileCorpus[];
  /** Kept for API compatibility; unused — failure returns empty retryable. */
  pagesForFallback?: PageAnalysis[];
  examLabel?: string | null;
  examDate?: string | null;
  deadlineAt?: number;
  allowModel?: boolean;
  /** Existing map to extend/merge rather than replace. */
  previousOutline?: OutlineUnitDraft[];
  /** The book's own table of contents, if we extracted one. */
  tocBlock?: string;
}): Promise<OneShotOutlineResult> {
  const bounds = filePageBounds(input.files);
  const maxPage = Math.max(1, ...bounds);
  // Routing reads total pages the student uploaded, not the highest page
  // number in any one file — two 16-page files are 32 pages of work.
  const pageCount = input.files.reduce((total, file) => total + file.pages.length, 0);

  if (input.allowModel === false) {
    return failedResult();
  }

  const corpus = buildMaterialCorpus(input.files);
  if (!corpus.trim()) {
    return failedResult();
  }

  const fileGuide = fileGuideBlock(input.files, bounds);
  const pageTexts = pageTextMapFromFiles(input.files);
  const validationOptions: OneShotValidationOptions = {
    filePageCounts: bounds,
    pageTexts,
  };
  const routed = selectOutlineModel({ pageCount, corpusChars: corpus.length });
  const strong = outlineStrongModel();
  const keyFor =
    (attempt: "first" | "escalate" | "repair") =>
    (suffix?: string) =>
      outlineIdempotencyKey({
        userId: input.userId,
        files: input.files,
        pageCount,
        attempt,
        suffix,
      });

  const shared = {
    service: input.service,
    userId: input.userId,
    corpus,
    fileGuide,
    maxPage,
    examLabel: input.examLabel,
    examDate: input.examDate,
    deadlineAt: input.deadlineAt,
    tocBlock: input.tocBlock,
    previousOutline: input.previousOutline,
  };

  const firstPass = await outlineWithModel({
    ...shared,
    model: routed.model,
    tier: routed.tier,
    idempotencyKeyFor: keyFor("first"),
  });
  let draft = firstPass.draft;
  let usedModel = routed.model;
  let resultPath: OneShotOutlineResult["path"] = firstPass.path;

  if (!draft) {
    // Mini totally failed → escalate to strong once before giving up.
    if (routed.tier === "standard") {
      const escalated = await outlineWithModel({
        ...shared,
        model: strong,
        tier: "strong",
        idempotencyKeyFor: keyFor("escalate"),
      });
      draft = escalated.draft;
      usedModel = strong;
      resultPath = "escalation";
    }
    if (!draft) return failedResult({ path: "failed", model: usedModel });
  }

  let validated = validateOneShotOutline(draft, validationOptions);

  // Quality escalation: mini kept nothing → redo with gpt-4.1.
  if (!validated.ok && routed.tier === "standard" && usedModel !== strong) {
    const escalated = await outlineWithModel({
      ...shared,
      model: strong,
      tier: "strong",
      idempotencyKeyFor: keyFor("escalate"),
    });
    usedModel = strong;
    resultPath = "escalation";
    if (escalated.draft) {
      draft = escalated.draft;
      validated = validateOneShotOutline(draft, validationOptions);
    }
  }

  if (!validated.ok) {
    const repairErrors = validated.issues.map((issue) => JSON.stringify(issue)).join("\n");
    // Reading the whole book again is what made repair time out. The model
    // already told us which pages it claims to cite — send back only those.
    const cited = buildCitedPagesCorpus(
      input.files,
      citedRefsFromDraft(draft, input.files.length === 1),
    );
    const repairCorpus = (cited || corpus).slice(0, ONESHOT_STRONG_MAX_CHARS);
    const repaired = await callOutlineModel({
      ...shared,
      corpus: repairCorpus,
      model: strong,
      idempotencyKey: keyFor("repair")(),
      repairErrors,
      invalidDraftJson: JSON.stringify(draft),
    });
    usedModel = strong;
    if (repaired) {
      const repairedValidation = validateOneShotOutline(repaired, validationOptions);
      if (repairedValidation.ok) {
        return {
          units: repairedValidation.normalized,
          fromModel: true,
          path: "repair",
          retryable: false,
          model: usedModel,
          droppedTopics: repairedValidation.dropped.length,
        };
      }
    }
    return failedResult({ path: "failed", model: usedModel });
  }

  return {
    units: validated.normalized,
    fromModel: true,
    path: resultPath,
    retryable: false,
    model: usedModel,
    droppedTopics: validated.dropped.length,
  };
}
