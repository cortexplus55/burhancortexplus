/**
 * One-shot study outline: one model call over the whole material returns
 * units→topics + learning path (teacher + student perspectives).
 *
 * Routing: ≤30 pages → gpt-4o-mini; >30 pages (or corpus too large for mini)
 * → gpt-4.1. Validation failure escalates to the strong model; one repair
 * on the strong model. Total failure → empty retryable result (no fake list).
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

/** Pick outline model from material size (pages + corpus chars). */
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

const examWeightSchema = z.enum(["high", "medium", "low"]);

const topicSchema = z.object({
  id: z.string().trim().min(1).max(40).optional(),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(400).optional().default(""),
  whyLearn: z.string().trim().max(400).optional().default(""),
  pageStart: z.number().int().positive(),
  pageEnd: z.number().int().positive(),
  examWeight: examWeightSchema.optional().default("medium"),
  likelyAsked: z.array(z.string().trim().min(1).max(160)).max(4).optional().default([]),
  prerequisiteIds: z.array(z.string().trim().min(1).max(40)).max(8).optional().default([]),
});

const unitSchema = z.object({
  title: z.string().trim().min(1).max(120),
  examWeight: examWeightSchema.optional().default("medium"),
  topics: z.array(topicSchema).min(1).max(40),
});

export const oneShotOutlineSchema = z.object({
  units: z.array(unitSchema).min(1).max(20),
});

export type OneShotOutlineDraft = z.infer<typeof oneShotOutlineSchema>;

export type OneShotOutlineResult = {
  units: OutlineUnitDraft[];
  fromModel: boolean;
  path: "single" | "split_merge" | "repair" | "escalation" | "failed";
  /** True when the student should retry — never invent a fake map. */
  retryable: boolean;
  model?: string;
};

export type MaterialFileCorpus = {
  fileName: string;
  pages: { pageNumber: number; text: string }[];
};

export function buildMaterialCorpus(files: MaterialFileCorpus[]): string {
  const parts: string[] = [];
  for (const file of files) {
    parts.push(`=== Dosya: ${file.fileName} ===`);
    for (const page of file.pages) {
      const body = (page.text ?? "").replace(/\s+/g, " ").trim();
      if (!body) continue;
      parts.push(`[s.${page.pageNumber}] ${body}`);
    }
  }
  return parts.join("\n");
}

export function pageTextMapFromFiles(files: MaterialFileCorpus[]): Map<number, string> {
  const map = new Map<number, string>();
  for (const file of files) {
    for (const page of file.pages) {
      const prev = map.get(page.pageNumber) ?? "";
      const body = (page.text ?? "").trim();
      map.set(page.pageNumber, prev ? `${prev}\n${body}` : body);
    }
  }
  return map;
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
    out.push(raw);
  }
  return [...new Set(out)];
}

export function topicTextGrounded(input: {
  title: string;
  whyLearn?: string | null;
  likelyAsked?: string[];
  pageStart: number;
  pageEnd: number;
  pageTexts: Map<number, string>;
}): boolean {
  const start = Math.min(input.pageStart, input.pageEnd);
  const end = Math.max(input.pageStart, input.pageEnd);
  const cited: string[] = [];
  for (let p = start; p <= end; p += 1) {
    cited.push(input.pageTexts.get(p) ?? "");
  }
  const pageTokens = new Set(normalizeOutlineTokens(cited.join(" ")));
  if (!pageTokens.size) return false;

  const topicBlob = [input.title, input.whyLearn ?? "", ...(input.likelyAsked ?? [])].join(" ");
  const topicTokens = normalizeOutlineTokens(topicBlob);
  if (!topicTokens.length) return false;

  const hit = topicTokens.filter((t) => pageTokens.has(t)).length;
  const need = Math.min(2, topicTokens.length);
  if (hit >= need) return true;
  return hit / topicTokens.length >= 0.34;
}

export type OneShotValidationIssue =
  | { code: "unit_count"; units: number }
  | { code: "topic_count"; topics: number }
  | { code: "empty_title" }
  | { code: "empty_unit"; title: string }
  | { code: "duplicate_topic"; title: string }
  | { code: "page_range"; title: string; pageStart: number; pageEnd: number }
  | { code: "ungrounded_topic"; title: string; pageStart: number; pageEnd: number }
  | { code: "diger_bucket"; title: string };

export function validateOneShotOutline(
  draft: OneShotOutlineDraft,
  maxPage: number,
  pageTexts?: Map<number, string>,
): { ok: true; normalized: OutlineUnitDraft[] } | { ok: false; issues: OneShotValidationIssue[] } {
  const issues: OneShotValidationIssue[] = [];
  if (draft.units.length < 1 || draft.units.length > 20) {
    issues.push({ code: "unit_count", units: draft.units.length });
  }
  const allTopics = draft.units.flatMap((u) => u.topics);
  if (allTopics.length > 40) {
    issues.push({ code: "topic_count", topics: allTopics.length });
  }

  const seen = new Set<string>();
  const idToTitle = new Map<string, string>();
  let autoId = 0;
  for (const unit of draft.units) {
    for (const topic of unit.topics) {
      const title = topic.title.trim();
      if (!title) continue;
      const id = (topic.id?.trim() || `t${++autoId}`).slice(0, 40);
      if (!idToTitle.has(id)) idToTitle.set(id, title);
    }
  }

  const normalized: OutlineUnitDraft[] = [];

  for (const unit of draft.units) {
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
      let start = Math.min(topic.pageStart, topic.pageEnd);
      let end = Math.max(topic.pageStart, topic.pageEnd);
      if (start < 1 || end > maxPage || !Number.isFinite(start) || !Number.isFinite(end)) {
        issues.push({
          code: "page_range",
          title,
          pageStart: topic.pageStart,
          pageEnd: topic.pageEnd,
        });
        continue;
      }
      start = Math.max(1, Math.min(start, maxPage));
      end = Math.max(start, Math.min(end, maxPage));

      const why =
        (topic.whyLearn || topic.description || "").trim().slice(0, 400) || undefined;
      const likelyAsked = [...new Set((topic.likelyAsked ?? []).map((s) => s.trim()).filter(Boolean))]
        .slice(0, 4);

      if (
        pageTexts &&
        !topicTextGrounded({
          title,
          whyLearn: why,
          likelyAsked,
          pageStart: start,
          pageEnd: end,
          pageTexts,
        })
      ) {
        issues.push({
          code: "ungrounded_topic",
          title,
          pageStart: start,
          pageEnd: end,
        });
        continue;
      }

      seen.add(key);
      const pageNumbers: number[] = [];
      for (let p = start; p <= end; p += 1) pageNumbers.push(p);
      const prerequisiteTitles = [
        ...new Set(
          (topic.prerequisiteIds ?? [])
            .map((id) => idToTitle.get(id.trim()) ?? "")
            .filter((t) => t && t.toLocaleLowerCase("tr") !== key),
        ),
      ].slice(0, 8);
      topics.push({
        id: topic.id?.trim() || undefined,
        title,
        sourceTitles: [title],
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

  if (!normalized.length) {
    issues.push({ code: "unit_count", units: 0 });
  }
  if (issues.length) return { ok: false, issues };
  return { ok: true, normalized };
}

function examContextLine(examLabel?: string | null, examDate?: string | null): string {
  const parts: string[] = [];
  if (examLabel?.trim()) parts.push(examLabel.trim());
  if (examDate?.trim()) parts.push(examDate.trim());
  if (!parts.length) return "bu sınava";
  return `"${parts.join(" / ")}" sınavına`;
}

function studentOutlinePrompt(input: {
  examLabel?: string | null;
  examDate?: string | null;
  corpus: string;
  maxPage: number;
  repairErrors?: string;
}): string {
  const exam = examContextLine(input.examLabel, input.examDate);
  const repair = input.repairErrors
    ? `\n\nÖnceki çıktı geçersizdi. Düzeltmen gerekenler:\n${input.repairErrors}\nYeniden üret.`
    : "";
  return `Bu materyalle ${exam} hazırlanıyorsun. Tek JSON çıktıda İKİ bakış açısını birlikte kodla.

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
- Her konu ve her likelyAsked maddesi, pageStart–pageEnd aralığındaki [s.N] metniyle desteklenmeli.
- Materyal bir şeyi kapsamıyorsa onu ekleme.
- pageStart/pageEnd gerçek [s.N] işaretlerinden; 1–${input.maxPage} dışında numara uydurma.
- Kitabın/dosyaların kendi yapısını (içindekiler, bölüm başlıkları) dikkate al ama logolar, seri adları, sayfa üstbilgileri, soru numaraları, şıklar, OCR bozukluklarını konu yapma.
- "Diğer Konular" kovası EKLEME. Ünite 1–20, toplam konu ≤40.

JSON: {"units":[{"title":string,"examWeight":"high|medium|low","topics":[{"id":string,"title":string,"whyLearn":string,"description":string,"pageStart":number,"pageEnd":number,"examWeight":"high|medium|low","likelyAsked":string[],"prerequisiteIds":string[]}]}]}

Materyal:
${input.corpus}${repair}`;
}

const SCHEMA_HINT =
  'JSON: {"units":[{"title":string,"examWeight":"high|medium|low","topics":[{"id":string,"title":string,"whyLearn":string,"description":string,"pageStart":number,"pageEnd":number,"examWeight":"high|medium|low","likelyAsked":string[2-4],"prerequisiteIds":string[]}]}]}. ' +
  "Öğretmen+öğrenci bakışı. Uydurma yok — her konu alıntılanan sayfa metnine dayanır. 1–20 ünite, ≤40 konu. Diğer Konular yok. Öğrenme sırası (önkoşul önce).";

async function callOutlineModel(input: {
  service: SupabaseClient;
  userId: string;
  corpus: string;
  maxPage: number;
  model: string;
  examLabel?: string | null;
  examDate?: string | null;
  deadlineAt?: number;
  repairErrors?: string;
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
      schemaHint: SCHEMA_HINT,
      userPrompt: studentOutlinePrompt({
        examLabel: input.examLabel,
        examDate: input.examDate,
        corpus: input.corpus,
        maxPage: input.maxPage,
        repairErrors: input.repairErrors,
      }),
      parse: (raw) => {
        const parsed = oneShotOutlineSchema.safeParse(raw);
        return parsed.success ? parsed.data : null;
      },
    });
    if (generated.ok && generated.data) return generated.data;
  } catch {
    return null;
  }
  return null;
}

function failedResult(partial?: { path?: OneShotOutlineResult["path"]; model?: string }): OneShotOutlineResult {
  return {
    units: [],
    fromModel: false,
    path: partial?.path ?? "failed",
    retryable: true,
    model: partial?.model,
  };
}

async function outlineWithModel(input: {
  service: SupabaseClient;
  userId: string;
  corpus: string;
  maxPage: number;
  model: string;
  tier: "standard" | "strong";
  examLabel?: string | null;
  examDate?: string | null;
  deadlineAt?: number;
}): Promise<{ draft: OneShotOutlineDraft | null; path: "single" | "split_merge" }> {
  // Strong model reads the whole material in one call (1M context).
  if (input.tier === "strong" || input.corpus.length <= ONESHOT_MAX_INPUT_CHARS) {
    const corpus =
      input.tier === "strong" && input.corpus.length > ONESHOT_STRONG_MAX_CHARS
        ? input.corpus.slice(0, ONESHOT_STRONG_MAX_CHARS)
        : input.corpus;
    const draft = await callOutlineModel({
      service: input.service,
      userId: input.userId,
      corpus,
      maxPage: input.maxPage,
      model: input.model,
      examLabel: input.examLabel,
      examDate: input.examDate,
      deadlineAt: input.deadlineAt,
    });
    return { draft, path: "single" };
  }

  const parts = splitCorpusForContext(input.corpus);
  if (parts.length === 1) {
    const draft = await callOutlineModel({
      service: input.service,
      userId: input.userId,
      corpus: parts[0]!,
      maxPage: input.maxPage,
      model: input.model,
      examLabel: input.examLabel,
      examDate: input.examDate,
      deadlineAt: input.deadlineAt,
    });
    return { draft, path: "single" };
  }

  const partials = await Promise.all(
    parts.map((part, index) =>
      callOutlineModel({
        service: input.service,
        userId: input.userId,
        corpus: `--- Parça ${index + 1}/${parts.length} ---\n${part}`,
        maxPage: input.maxPage,
        model: input.model,
        examLabel: input.examLabel,
        examDate: input.examDate,
        deadlineAt: input.deadlineAt,
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
    service: input.service,
    userId: input.userId,
    corpus: `Aşağıdaki kısmi ünite/konu taslaklarını tek bir bütün çalışma yolunda birleştir. Metni yeniden okuma; yalnızca taslakları birleştir, yinele, sıraya koy. Uydurma ekleme.\n\n${mergeCorpus}`,
    maxPage: input.maxPage,
    model: input.model,
    examLabel: input.examLabel,
    examDate: input.examDate,
    deadlineAt: input.deadlineAt,
  });
  return { draft, path: "split_merge" };
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
}): Promise<OneShotOutlineResult> {
  const maxPage = Math.max(
    1,
    ...input.files.flatMap((f) => f.pages.map((p) => p.pageNumber)),
    ...(input.pagesForFallback ?? []).map((p) => p.pageNumber),
  );
  const pageCount = Math.max(
    ...input.files.flatMap((f) => f.pages.map((p) => p.pageNumber)),
    0,
  );

  if (input.allowModel === false) {
    return failedResult();
  }

  const corpus = buildMaterialCorpus(input.files);
  if (!corpus.trim()) {
    return failedResult();
  }

  const pageTexts = pageTextMapFromFiles(input.files);
  const routed = selectOutlineModel({ pageCount, corpusChars: corpus.length });
  const strong = outlineStrongModel();

  let { draft, path } = await outlineWithModel({
    service: input.service,
    userId: input.userId,
    corpus,
    maxPage,
    model: routed.model,
    tier: routed.tier,
    examLabel: input.examLabel,
    examDate: input.examDate,
    deadlineAt: input.deadlineAt,
  });
  let usedModel = routed.model;
  let resultPath: OneShotOutlineResult["path"] = path;

  if (!draft) {
    // Mini totally failed → escalate to strong once before giving up.
    if (routed.tier === "standard") {
      const escalated = await outlineWithModel({
        service: input.service,
        userId: input.userId,
        corpus,
        maxPage,
        model: strong,
        tier: "strong",
        examLabel: input.examLabel,
        examDate: input.examDate,
        deadlineAt: input.deadlineAt,
      });
      draft = escalated.draft;
      usedModel = strong;
      resultPath = "escalation";
    }
    if (!draft) return failedResult({ path: "failed", model: usedModel });
  }

  let validated = validateOneShotOutline(draft, maxPage, pageTexts);

  // Quality escalation: mini result failed validation → redo with gpt-4.1.
  if (!validated.ok && routed.tier === "standard" && usedModel !== strong) {
    const escalated = await outlineWithModel({
      service: input.service,
      userId: input.userId,
      corpus,
      maxPage,
      model: strong,
      tier: "strong",
      examLabel: input.examLabel,
      examDate: input.examDate,
      deadlineAt: input.deadlineAt,
    });
    usedModel = strong;
    resultPath = "escalation";
    if (escalated.draft) {
      draft = escalated.draft;
      validated = validateOneShotOutline(draft, maxPage, pageTexts);
    }
  }

  if (!validated.ok) {
    const repairErrors = validated.issues.map((issue) => JSON.stringify(issue)).join("\n");
    const repairCorpus =
      corpus.length > ONESHOT_STRONG_MAX_CHARS
        ? corpus.slice(0, ONESHOT_STRONG_MAX_CHARS)
        : corpus;
    const repaired = await callOutlineModel({
      service: input.service,
      userId: input.userId,
      corpus: repairCorpus,
      maxPage,
      model: strong,
      examLabel: input.examLabel,
      examDate: input.examDate,
      deadlineAt: input.deadlineAt,
      repairErrors,
    });
    usedModel = strong;
    if (repaired) {
      validated = validateOneShotOutline(repaired, maxPage, pageTexts);
      if (validated.ok) {
        return {
          units: validated.normalized,
          fromModel: true,
          path: "repair",
          retryable: false,
          model: usedModel,
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
  };
}
