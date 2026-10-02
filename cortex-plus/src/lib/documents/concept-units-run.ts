import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import { env } from "@/lib/env";
import { contentModel } from "@/lib/ai/model-router";
import { recordUsage } from "@/lib/credits/service";
import type { PageAnalysis } from "@/lib/documents/page-analysis";
import { parseModelJson } from "@/lib/learning/teaching-standards";
import {
  UNIT_SYSTEM,
  needsUnits,
  pageLead,
  unitUserPrompt,
  unitsFromModel,
  type ConceptUnit,
  type UnitTopicInput,
} from "@/lib/documents/concept-units";

/**
 * Konu haritasının büyük konularını tek luna çağrısıyla kavram birimlerine
 * böler. Konu sırasına göre birim dizisi döner; bölünmeyen ya da geçersiz
 * bölünen konu için boş dizi (plan mekanik bölmeye döner). Maliyet öğrenciye
 * yazılmaz; kullanım TOPIC_UNITS olarak kaydedilir.
 */
export async function buildConceptUnits(
  service: SupabaseClient,
  input: {
    userId: string;
    documentId: string;
    topics: { title: string; pageNumbers: number[] }[];
    analyses: PageAnalysis[];
    edges: string[];
  },
): Promise<ConceptUnit[][]> {
  const empty = input.topics.map((): ConceptUnit[] => []);
  if (!env.OPENAI_API_KEY) return empty;
  const byPage = new Map(input.analyses.map((analysis) => [analysis.pageNumber, analysis]));
  const candidates: (UnitTopicInput & { pageNumbers: number[] })[] = input.topics.flatMap((topic, index) => {
    const pageNumbers = [...new Set(topic.pageNumbers)].sort((a, b) => a - b);
    if (!needsUnits(pageNumbers)) return [];
    return [
      {
        index,
        title: topic.title,
        pageNumbers,
        pages: pageNumbers.map((page) => {
          const analysis = byPage.get(page);
          return {
            page,
            headings: (analysis?.headings ?? []).slice(0, 4),
            lead: pageLead(analysis?.textContent ?? "", input.edges),
          };
        }),
      },
    ];
  });
  if (!candidates.length) return empty;

  try {
    const model = contentModel();
    const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 120_000, maxRetries: 1 });
    const response = await openai.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: UNIT_SYSTEM },
        { role: "user", content: unitUserPrompt(candidates) },
      ],
    });
    void recordUsage(service, {
      userId: input.userId,
      actionCode: "TOPIC_UNITS",
      model,
      tokensIn: response.usage?.prompt_tokens ?? 0,
      tokensOut: response.usage?.completion_tokens ?? 0,
    }).catch(() => undefined);
    const units = unitsFromModel(
      parseModelJson(response.choices[0]?.message?.content ?? ""),
      candidates.map((candidate) => ({ index: candidate.index, pages: candidate.pageNumbers })),
    );
    console.info("concept_units", {
      documentId: input.documentId,
      topics: candidates.length,
      split: units.size,
    });
    return input.topics.map((_, index) => units.get(index) ?? []);
  } catch (error) {
    console.error("concept_units_failed", {
      documentId: input.documentId,
      cause: error instanceof Error ? error.message.slice(0, 160) : "unknown",
    });
    return empty;
  }
}
