/**
 * One-shot study outline: one gpt-4o-mini call over the whole material
 * (or split→parallel→merge when too long). Fallback only on total LLM failure.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { generateJson, isPremiumUser } from "@/lib/ai/generate";
import {
  cleanOutlineDeterministic,
  deterministicUnitsAsDraft,
  extractTocUnits,
  detectPageFurniture,
  type OutlineUnitDraft,
} from "@/lib/documents/outline-clean";
import { chapterHeadings } from "@/lib/documents/topic-title";
import type { PageAnalysis } from "@/lib/documents/page-analysis";

/** ~100k tokens ≈ 350k chars; stay under with margin for system/prompt. */
export const ONESHOT_MAX_INPUT_CHARS = 280_000;
/** Split into at most this many parallel parts. */
export const ONESHOT_MAX_PARTS = 3;

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
  path: "single" | "split_merge" | "repair" | "fallback";
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

/** Split on file/page boundaries when corpus exceeds the budget. */
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
      // Remainder goes into the last part even if slightly over.
      continue;
    }
  }
  flush();
  if (parts.length > ONESHOT_MAX_PARTS) {
    // Merge excess into the last allowed parts.
    const head = parts.slice(0, ONESHOT_MAX_PARTS - 1);
    const tail = parts.slice(ONESHOT_MAX_PARTS - 1).join("\n");
    return [...head, tail];
  }
  return parts.length ? parts : [corpus.slice(0, maxChars)];
}

export type OneShotValidationIssue =
  | { code: "unit_count"; units: number }
  | { code: "topic_count"; topics: number }
  | { code: "empty_title" }
  | { code: "duplicate_topic"; title: string }
  | { code: "page_range"; title: string; pageStart: number; pageEnd: number }
  | { code: "diger_bucket"; title: string };

export function validateOneShotOutline(
  draft: OneShotOutlineDraft,
  maxPage: number,
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
  // First pass: assign stable local ids and collect titles.
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
      seen.add(key);
      const pageNumbers: number[] = [];
      for (let p = start; p <= end; p += 1) pageNumbers.push(p);
      const why =
        (topic.whyLearn || topic.description || "").trim().slice(0, 400) || undefined;
      const likelyAsked = [...new Set((topic.likelyAsked ?? []).map((s) => s.trim()).filter(Boolean))]
        .slice(0, 4);
      const prerequisiteTitles = [...new Set(
        (topic.prerequisiteIds ?? [])
          .map((id) => idToTitle.get(id.trim()) ?? "")
          .filter((t) => t && t.toLocaleLowerCase("tr") !== key),
      )].slice(0, 8);
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
    if (topics.length) {
      normalized.push({
        title: unitTitle,
        examWeight: unit.examWeight ?? "medium",
        topics,
      });
    }
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
- Her konu için likelyAsked: 2–4 kısa madde (sinavda_sorulabilecekler).

2) ÖĞRENCİ bakışı:
- Bu içeriği en iyi nasıl anlarım, hangi sırayla çalışırım?
- Ünite/konu sırasını öğrenme sırasına koy (önkoşullar önce; kitap sırasından farklı olabilir).
- Konuları öğrencinin çalışacağı gibi grupla.
- Her konu için whyLearn: tek cümle (ne öğreneceğim / neden önemli).
- Her konuya kısa id ver (ör. "t1") ve prerequisiteIds ile önceki konu id'lerini bağla.

Ortak kurallar:
- Kitabın/dosyaların kendi yapısını (içindekiler, bölüm başlıkları) dikkate al ama logolar, seri adları, sayfa üstbilgileri, soru numaraları, şıklar, OCR bozukluklarını konu yapma.
- pageStart/pageEnd gerçek [s.N] işaretlerinden; 1–${input.maxPage} dışında numara uydurma.
- "Diğer Konular" kovası EKLEME. Ünite 1–20, toplam konu ≤40.

JSON: {"units":[{"title":string,"examWeight":"high|medium|low","topics":[{"id":string,"title":string,"whyLearn":string,"description":string,"pageStart":number,"pageEnd":number,"examWeight":"high|medium|low","likelyAsked":string[],"prerequisiteIds":string[]}]}]}

Materyal:
${input.corpus}${repair}`;
}

const SCHEMA_HINT =
  'JSON: {"units":[{"title":string,"examWeight":"high|medium|low","topics":[{"id":string,"title":string,"whyLearn":string,"description":string,"pageStart":number,"pageEnd":number,"examWeight":"high|medium|low","likelyAsked":string[2-4],"prerequisiteIds":string[]}]}]}. ' +
  "Öğretmen+öğrenci bakışı birlikte. 1–20 ünite, ≤40 konu. Diğer Konular yok. Öğrenme sırası (önkoşul önce).";

async function callOutlineModel(input: {
  service: SupabaseClient;
  userId: string;
  corpus: string;
  maxPage: number;
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

function fallbackFromPages(
  pages: PageAnalysis[],
  fileName: string,
): OutlineUnitDraft[] {
  const light = pages.map((p) => ({
    pageNumber: p.pageNumber,
    text: p.textContent,
    pageKind: p.pageKind,
    headings: p.headings,
  }));
  const tocUnits = extractTocUnits(light);
  const furniture = detectPageFurniture(light);
  const byTitle = new Map<string, number[]>();
  for (const page of pages) {
    for (const heading of page.headings ?? []) {
      const title = heading.trim();
      if (!title) continue;
      const list = byTitle.get(title) ?? [];
      list.push(page.pageNumber);
      byTitle.set(title, list);
    }
  }
  // Prefer chapterHeadings order when available.
  const ordered = chapterHeadings(pages);
  const titles =
    ordered.length > 0
      ? ordered.map((title) => ({
          title,
          pageNumbers: [...new Set(byTitle.get(title) ?? [])].sort((a, b) => a - b),
        }))
      : [...byTitle.entries()].map(([title, pageNumbers]) => ({
          title,
          pageNumbers: [...new Set(pageNumbers)].sort((a, b) => a - b),
        }));
  // Drop titles with no real pages — never invent page numbers.
  const grounded = titles.filter((t) => t.pageNumbers.length > 0);
  if (!grounded.length) {
    return [
      {
        title: fileName.replace(/\.[^.]+$/, "") || "Konular",
        topics: pages
          .filter((p) => p.pageKind === "content" || p.pageKind === "uncertain")
          .slice(0, 40)
          .map((p) => ({
            title: p.headings[0] || `Sayfa ${p.pageNumber}`,
            sourceTitles: [p.headings[0] || `Sayfa ${p.pageNumber}`],
            pageNumbers: [p.pageNumber],
          }))
          .filter((t) => t.pageNumbers.length > 0),
      },
    ].filter((u) => u.topics.length > 0);
  }
  const cleaned = cleanOutlineDeterministic({
    titles: grounded,
    seriesLabels: furniture.seriesLabels,
    unitRuns: furniture.unitRuns,
    tocUnits: tocUnits.length ? tocUnits : undefined,
    contentPageCount: pages.filter(
      (p) => p.pageKind === "content" || p.pageKind === "uncertain",
    ).length,
  });
  return deterministicUnitsAsDraft(cleaned);
}

/**
 * Whole-material outline. Prefer a single model call; split+merge when needed.
 */
export async function buildOutlineOneShot(input: {
  service: SupabaseClient;
  userId: string;
  files: MaterialFileCorpus[];
  /** Analyses used only for fallback (headings/TOC). */
  pagesForFallback: PageAnalysis[];
  examLabel?: string | null;
  examDate?: string | null;
  deadlineAt?: number;
  allowModel?: boolean;
}): Promise<OneShotOutlineResult> {
  const maxPage = Math.max(
    1,
    ...input.files.flatMap((f) => f.pages.map((p) => p.pageNumber)),
    ...input.pagesForFallback.map((p) => p.pageNumber),
  );
  const fileName = input.files.map((f) => f.fileName).join(" + ") || "belge";

  if (input.allowModel === false) {
    return {
      units: fallbackFromPages(input.pagesForFallback, fileName),
      fromModel: false,
      path: "fallback",
    };
  }

  const corpus = buildMaterialCorpus(input.files);
  if (!corpus.trim()) {
    return {
      units: fallbackFromPages(input.pagesForFallback, fileName),
      fromModel: false,
      path: "fallback",
    };
  }

  const parts = splitCorpusForContext(corpus);
  let draft: OneShotOutlineDraft | null = null;
  let path: OneShotOutlineResult["path"] = "single";

  if (parts.length === 1) {
    draft = await callOutlineModel({
      service: input.service,
      userId: input.userId,
      corpus: parts[0]!,
      maxPage,
      examLabel: input.examLabel,
      examDate: input.examDate,
      deadlineAt: input.deadlineAt,
    });
  } else {
    path = "split_merge";
    const partials = await Promise.all(
      parts.map((part, index) =>
        callOutlineModel({
          service: input.service,
          userId: input.userId,
          corpus: `--- Parça ${index + 1}/${parts.length} ---\n${part}`,
          maxPage,
          examLabel: input.examLabel,
          examDate: input.examDate,
          deadlineAt: input.deadlineAt,
        }),
      ),
    );
    if (partials.some((p) => !p)) {
      return {
        units: fallbackFromPages(input.pagesForFallback, fileName),
        fromModel: false,
        path: "fallback",
      };
    }
    const mergeCorpus = partials
      .map(
        (p, i) =>
          `=== Kısmi taslak ${i + 1} ===\n${JSON.stringify(p)}`,
      )
      .join("\n");
    draft = await callOutlineModel({
      service: input.service,
      userId: input.userId,
      corpus: `Aşağıdaki kısmi ünite/konu taslaklarını tek bir bütün çalışma yolunda birleştir. Metni yeniden okuma; yalnızca taslakları birleştir, yinele, sıraya koy.\n\n${mergeCorpus}`,
      maxPage,
      examLabel: input.examLabel,
      examDate: input.examDate,
      deadlineAt: input.deadlineAt,
    });
  }

  if (!draft) {
    return {
      units: fallbackFromPages(input.pagesForFallback, fileName),
      fromModel: false,
      path: "fallback",
    };
  }

  let validated = validateOneShotOutline(draft, maxPage);
  if (!validated.ok) {
    const repairErrors = validated.issues
      .map((issue) => JSON.stringify(issue))
      .join("\n");
    const repaired = await callOutlineModel({
      service: input.service,
      userId: input.userId,
      corpus: parts.length === 1 ? parts[0]! : buildMaterialCorpus(input.files).slice(0, ONESHOT_MAX_INPUT_CHARS),
      maxPage,
      examLabel: input.examLabel,
      examDate: input.examDate,
      deadlineAt: input.deadlineAt,
      repairErrors,
    });
    if (repaired) {
      validated = validateOneShotOutline(repaired, maxPage);
      if (validated.ok) {
        return { units: validated.normalized, fromModel: true, path: "repair" };
      }
    }
    return {
      units: fallbackFromPages(input.pagesForFallback, fileName),
      fromModel: false,
      path: "fallback",
    };
  }

  return { units: validated.normalized, fromModel: true, path };
}
