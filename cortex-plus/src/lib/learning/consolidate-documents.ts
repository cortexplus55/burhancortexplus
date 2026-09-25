import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateJson, isPremiumUser } from "@/lib/ai/generate";
import { pickMainTopics } from "@/lib/learning/diagnostic";
import {
  applyClusterMerges,
  consolidateMaterials,
  type ConsolidationResult,
  type MaterialCandidate,
  type MaterialDocument,
} from "@/lib/learning/cross-material-topics";
import { findAnalysisTopic, parseTeacherAnalysis } from "@/lib/learning/teacher-brain";

const TEXT_CAP = 14_000;

const mergeSchema = z.object({
  merge: z.array(z.array(z.string().min(2).max(140)).min(2).max(4)).max(6),
});

function asStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

/**
 * Hazırlıktaki bütün belgelerin konu adaylarını tek listeye indirir.
 *
 * Model yalnızca yazımın kararsız bıraktığı çiftler varsa ve o zaman da
 * tek çağrıyla çalışır. Çağrı düşerse deterministik liste durur.
 */
export async function consolidatePrepDocuments(
  service: SupabaseClient,
  userId: string,
  documentIds: string[],
  options?: { allowModel?: boolean },
): Promise<ConsolidationResult> {
  const empty: ConsolidationResult = {
    topics: [],
    excluded: [],
    missingFromMaterials: [],
    suggestedExamDate: null,
    syllabusDocumentId: null,
    ambiguous: [],
    foldedNonTopics: [],
  };
  if (!documentIds.length) return empty;

  const [{ data: docs }, { data: nodes }, { data: pages }] = await Promise.all([
    service.from("documents").select("id, file_name").in("id", documentIds),
    service
      .from("document_topic_nodes")
      .select(
        "id, document_id, title, parent_id, sort_order, prerequisites, learning_objective, key_definitions, common_mistakes, source_exercises",
      )
      .in("document_id", documentIds)
      .order("sort_order"),
    service
      .from("document_pages")
      .select("document_id, page_number, text_content")
      .in("document_id", documentIds)
      .order("page_number"),
  ]);

  const fileName = new Map(
    (docs ?? []).map((row) => [row.id as string, (row.file_name as string | null) ?? ""]),
  );
  const textByDoc = new Map<string, string>();
  for (const page of pages ?? []) {
    const id = page.document_id as string;
    const have = textByDoc.get(id) ?? "";
    if (have.length >= TEXT_CAP) continue;
    const chunk = ((page.text_content as string | null) ?? "").slice(0, 2000);
    textByDoc.set(id, `${have}\n${chunk}`.slice(0, TEXT_CAP));
  }

  const documents: MaterialDocument[] = documentIds.map((documentId) => ({
    documentId,
    fileName: fileName.get(documentId) ?? "",
    text: textByDoc.get(documentId) ?? "",
  }));

  const linksByDoc = new Map<string, { topic_id: string; page_number: number }[]>();
  const topicIds = (nodes ?? []).map((node) => node.id as string);
  if (topicIds.length) {
    const { data: links } = await service
      .from("document_topic_page_links")
      .select("topic_id, page_number, document_id")
      .in("document_id", documentIds);
    for (const link of links ?? []) {
      const id = link.document_id as string;
      const list = linksByDoc.get(id) ?? [];
      list.push({ topic_id: link.topic_id as string, page_number: link.page_number as number });
      linksByDoc.set(id, list);
    }
  }

  const analysisByDoc = new Map<string, NonNullable<ReturnType<typeof parseTeacherAnalysis>>>();
  const { data: analyses, error: analysisError } = await service
    .from("document_teacher_analyses")
    .select("document_id, status, analysis")
    .in("document_id", documentIds);
  if (!analysisError) {
    for (const row of analyses ?? []) {
      if (row.status !== "ready") continue;
      const analysis = parseTeacherAnalysis(row.analysis);
      if (!analysis) continue;
      analysisByDoc.set(row.document_id as string, analysis);
    }
  }

  const candidates: MaterialCandidate[] = [];
  for (const documentId of documentIds) {
    const rows = (nodes ?? []).filter((node) => node.document_id === documentId);
    const mains = pickMainTopics(
      rows.map((node) => ({
        id: node.id as string,
        title: node.title as string,
        parentId: (node.parent_id as string | null) ?? null,
      })),
    );
    const mainIds = new Set(mains.map((topic) => topic.id));
    const links = linksByDoc.get(documentId) ?? [];
    for (const node of rows) {
      if (!mainIds.has(node.id as string)) continue;
      const id = node.id as string;
      const objective = ((node.learning_objective as string | null) ?? "").trim();
      const definitions = asStrings(node.key_definitions).slice(0, 4);
      const mistakes = asStrings(node.common_mistakes).slice(0, 6);
      const practice = asStrings(node.source_exercises).slice(0, 6);
      const analysis = analysisByDoc.get(documentId);
      const matched = analysis ? findAnalysisTopic(analysis, String(node.title ?? "")) : null;
      candidates.push({
        id,
        title: String(node.title ?? ""),
        summary: [objective, ...definitions].filter(Boolean).join(" ").slice(0, 400),
        pages: [...new Set(links.filter((link) => link.topic_id === id).map((link) => link.page_number))].sort(
          (a, b) => a - b,
        ),
        documentId,
        fileName: fileName.get(documentId) ?? "",
        prerequisites: asStrings(node.prerequisites),
        commonMistakes: mistakes,
        practiceItems: practice,
        emphasis: matched?.emphasis ?? null,
      });
    }
  }

  const consolidated = consolidateMaterials({ candidates, documents });
  if (!options?.allowModel || !userId || !consolidated.ambiguous.length) return consolidated;

  try {
    const merged = await resolveAmbiguousClusters(service, userId, consolidated);
    return { ...consolidated, topics: merged, ambiguous: [] };
  } catch {
    return consolidated;
  }
}

async function resolveAmbiguousClusters(
  service: SupabaseClient,
  userId: string,
  consolidated: ConsolidationResult,
) {
  const lines = consolidated.ambiguous.map(
    (pair) => `- "${pair.left}" | "${pair.right}"`,
  );
  const outcome = await generateJson({
    service,
    userId,
    actionCode: "STUDY_PLAN_GENERATE",
    isPremium: await isPremiumUser(service, userId),
    verificationMode: "schema",
    maxDraftAttempts: 1,
    difficulty: "easy",
    idempotencyKey: `topic-consolidate:${lines.join("|").slice(0, 180)}`,
    schemaHint:
      'JSON: {"merge":string[][]}. Her iç dizi AYNI sınav konusunun başlıkları. Emin değilsen merge boş. Alt başlık ile üst başlık aynı konu değildir. Konu düşürme.',
    userPrompt: [
      "Bu başlık çiftlerinden hangileri aynı sınav konusu? Yalnızca emin olduklarını merge içine yaz.",
      ...lines,
    ].join("\n"),
    parse: (raw) => {
      const parsed = mergeSchema.safeParse(raw);
      return parsed.success ? parsed.data : null;
    },
  });
  if (!outcome.ok) return consolidated.topics;
  return applyClusterMerges(consolidated.topics, outcome.data.merge);
}
