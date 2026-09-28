/**
 * One LLM consolidation round after window mapping: units > topics.
 * Falls back to deterministic outline-clean on reject/timeout.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { generateJson, isPremiumUser } from "@/lib/ai/generate";
import {
  cleanOutlineDeterministic,
  deterministicUnitsAsDraft,
  flattenOutlineUnits,
  outlineTopicBounds,
  validateOutlineLlmResult,
  type OutlineUnitDraft,
} from "@/lib/documents/outline-clean";
import { isNumberedChapter } from "@/lib/documents/topic-title";

const outlineSchema = z.object({
  units: z
    .array(
      z.object({
        title: z.string().trim().min(2).max(120),
        topics: z
          .array(
            z.object({
              title: z.string().trim().min(2).max(120),
              sourceTitles: z.array(z.string().trim().min(1)).min(1).max(12),
              pageNumbers: z.array(z.number().int().positive()).max(80),
            }),
          )
          .min(1)
          .max(40),
      }),
    )
    .min(1)
    .max(16),
});

export type OutlineLlmResult = {
  units: OutlineUnitDraft[];
  fromModel: boolean;
};

export async function buildOutlineLlm(input: {
  service: SupabaseClient;
  userId: string;
  fileName: string;
  candidates: { title: string; pageNumbers: number[]; sourceTitle?: string }[];
  contentPages: number[];
  numberedChapters?: string[];
  seriesLabels?: string[];
  unitRuns?: { label: string; pageNumbers: number[] }[];
  tocUnits?: { title: string; startPage: number }[];
  deadlineAt?: number;
  allowModel?: boolean;
}): Promise<OutlineLlmResult> {
  const contentPageCount = input.contentPages.length;
  const deterministic = cleanOutlineDeterministic({
    titles: input.candidates.map((c) => ({
      title: c.sourceTitle ?? c.title,
      pageNumbers: c.pageNumbers,
    })),
    seriesLabels: input.seriesLabels,
    unitRuns: input.unitRuns,
    tocUnits: input.tocUnits,
    contentPageCount,
  });
  const fallback = deterministicUnitsAsDraft(deterministic);

  if (!input.allowModel || !input.candidates.length) {
    return { units: fallback, fromModel: false };
  }

  const bounds = outlineTopicBounds(contentPageCount);
  const compact = deterministic.kept.map((c) => ({
    title: c.title,
    sourceTitle: c.sourceTitle,
    pageNumbers: c.pageNumbers,
    firstLine: c.title,
  }));

  let best: OutlineUnitDraft[] | null = null;

  try {
    const generated = await generateJson({
      service: input.service,
      userId: input.userId,
      actionCode: "STUDY_PLAN_GENERATE",
      isPremium: await isPremiumUser(input.service, input.userId),
      verificationMode: "schema",
      deadlineAt: input.deadlineAt,
      maxDraftAttempts: 2,
      schemaHint:
        'JSON: {"units":[{"title":string,"topics":[{"title":string,"sourceTitles":string[],"pageNumbers":number[]}]}]}. ' +
        "Her konu en az bir sourceTitle ile aday listesine bağlanmalı. Yeni konu uydurma.",
      userPrompt: `Aşağıda "${input.fileName}" belgesinin temizlenmiş konu adayları var (başlık + sayfa aralığı).
Görevin: konu olmayanları çıkar (soru kökleri, test bölümleri, şıklar, koşan başlıklar, parçalar),
OCR büyük harf/yazım hatalarını düzelt (Title Case, Türkçe harfler),
yakın tekrarları birleştir, belge sırasıyla üniteler > konular grupla.

Hedef: ${bounds.targetUnits} ünite (3–16), en fazla ${bounds.topicsMax} yaprak konu.
Aday listesi dışında konu UYDURMA. Her konunun sourceTitles alanında adaylardan en az bir başlık olsun.

Adaylar:
${compact
  .map(
    (c, i) =>
      `${i + 1}. ${c.title} ← kaynak:"${c.sourceTitle}" s.${c.pageNumbers[0] ?? "?"}-${c.pageNumbers[c.pageNumbers.length - 1] ?? "?"}`,
  )
  .join("\n")}`,
      parse: (raw) => {
        const parsed = outlineSchema.safeParse(raw);
        if (!parsed.success) return null;
        const draft = parsed.data.units as OutlineUnitDraft[];
        const check = validateOutlineLlmResult({
          draft,
          candidates: compact.map((c) => ({
            title: c.title,
            sourceTitle: c.sourceTitle,
            pageNumbers: c.pageNumbers,
          })),
          contentPages: input.contentPages,
          numberedChapters: (input.numberedChapters ?? []).filter((h) =>
            isNumberedChapter(h),
          ),
          contentPageCount,
        });
        if (!check.ok) return null;
        best = draft;
        return draft;
      },
    });
    if (generated.ok && generated.data) {
      return { units: generated.data as OutlineUnitDraft[], fromModel: true };
    }
  } catch {
    // timeout / provider — fall through
  }

  if (best) return { units: best, fromModel: true };
  return { units: fallback, fromModel: false };
}

export function outlineLeavesFromUnits(units: OutlineUnitDraft[]) {
  return flattenOutlineUnits(units);
}
