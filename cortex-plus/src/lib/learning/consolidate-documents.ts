import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateJson, isPremiumUser } from "@/lib/ai/generate";
import {
  detectPageFurniture,
  extractTocUnits,
} from "@/lib/documents/outline-clean";
import {
  buildStudyOutlineFromNodes,
  remapStudyUnitsToConsolidated,
  seriesLabelFromFileName,
  type StudyOutlineTopic,
  type StudyOutlineUnit,
} from "@/lib/learning/study-outline";
import {
  applyClusterMerges,
  consolidateMaterials,
  type ConsolidationResult,
  type MaterialCandidate,
  type MaterialDocument,
} from "@/lib/learning/cross-material-topics";
import { findAnalysisTopic, parseTeacherAnalysis } from "@/lib/learning/teacher-brain";
import { loadPagedDocumentRows } from "@/lib/learning/paged-document-rows";

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

  const { data: docs, error: docsError } = await service
    .from("documents")
    .select("id, file_name")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .in("id", documentIds);
  if (docsError || docs?.length !== new Set(documentIds).size) {
    throw new Error("documents_unavailable");
  }
  const [nodes, pages, links] = await Promise.all([
    loadPagedDocumentRows(
      service,
      "document_topic_nodes",
      "id, document_id, title, parent_id, sort_order, prerequisites, learning_objective, key_definitions, common_mistakes, source_exercises",
      documentIds,
      ["sort_order", "id"],
    ),
    loadPagedDocumentRows(
      service,
      "document_pages",
      "document_id, page_number, text_content, page_kind, headings",
      documentIds,
      ["page_number"],
    ),
    loadPagedDocumentRows(
      service,
      "document_topic_page_links",
      "topic_id, page_number, document_id",
      documentIds,
      ["topic_id", "page_number"],
    ),
  ]);

  const fileName = new Map(
    (docs ?? []).map((row) => [row.id as string, (row.file_name as string | null) ?? ""]),
  );
  const textByDoc = new Map<string, string>();
  for (const page of pages) {
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
  if (nodes.length) {
    for (const link of links) {
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

  const pagesByDoc = new Map<
    string,
    { page_number: number; text_content: string | null; page_kind: string | null; headings: unknown }[]
  >();
  for (const page of pages) {
    const id = page.document_id as string;
    const list = pagesByDoc.get(id) ?? [];
    list.push({
      page_number: page.page_number as number,
      text_content: page.text_content as string | null,
      page_kind: (page.page_kind as string | null) ?? null,
      headings: page.headings,
    });
    pagesByDoc.set(id, list);
  }

  const candidates: MaterialCandidate[] = [];
  let firstOutlineUnits: StudyOutlineUnit[] | null = null;
  let firstOutlineTopics: StudyOutlineTopic[] | null = null;

  for (const documentId of documentIds) {
    const rows = nodes.filter((node) => node.document_id === documentId);
    const docPages = pagesByDoc.get(documentId) ?? [];
    const pagesByTopic = new Map<string, number[]>();
    const links = linksByDoc.get(documentId) ?? [];
    for (const link of links) {
      const list = pagesByTopic.get(link.topic_id) ?? [];
      list.push(link.page_number);
      pagesByTopic.set(link.topic_id, list);
    }

    const lightPages = docPages.map((page) => ({
      pageNumber: page.page_number,
      text: ((page.text_content as string | null) ?? "").slice(0, 4000),
      pageKind: page.page_kind,
      headings: Array.isArray(page.headings) ? (page.headings as string[]) : undefined,
    }));
    const furniture = detectPageFurniture(lightPages);
    const tocUnits = extractTocUnits(lightPages);
    const name = fileName.get(documentId) ?? "";
    const seriesLabels = [
      ...new Set([...furniture.seriesLabels, ...seriesLabelFromFileName(name)]),
    ];
    const contentPageCount = docPages.filter(
      (p) => !p.page_kind || p.page_kind === "content" || p.page_kind === "uncertain",
    ).length;

    const outline = buildStudyOutlineFromNodes({
      nodes: rows.map((node) => ({
        id: node.id as string,
        title: String(node.title ?? ""),
        parentId: (node.parent_id as string | null) ?? null,
        sortOrder: typeof node.sort_order === "number" ? node.sort_order : 0,
      })),
      pagesByTopic,
      seriesLabels,
      unitRuns: furniture.unitRuns,
      tocUnits,
      contentPageCount: contentPageCount || docPages.length,
    });

    if (!firstOutlineUnits && outline.units.length) {
      firstOutlineUnits = outline.units;
      firstOutlineTopics = outline.topics;
    }

    const rowById = new Map(rows.map((node) => [node.id as string, node]));
    for (const topic of outline.topics) {
      const node =
        rowById.get(topic.id) ??
        rowById.get(topic.sourceNodeIds[0] ?? "") ??
        null;
      const objective = node ? ((node.learning_objective as string | null) ?? "").trim() : "";
      const definitions = node ? asStrings(node.key_definitions).slice(0, 4) : [];
      const mistakes = node ? asStrings(node.common_mistakes).slice(0, 6) : [];
      const practice = node ? asStrings(node.source_exercises).slice(0, 6) : [];
      const analysis = analysisByDoc.get(documentId);
      const matched =
        analysis && node ? findAnalysisTopic(analysis, String(node.title ?? "")) : null;
      candidates.push({
        id: topic.id,
        title: topic.title,
        summary: [objective, ...definitions].filter(Boolean).join(" ").slice(0, 400),
        pages: topic.pages,
        documentId,
        fileName: name,
        prerequisites: node ? asStrings(node.prerequisites) : [],
        commonMistakes: mistakes,
        practiceItems: practice,
        emphasis: matched?.emphasis ?? null,
      });
    }
  }

  const consolidated = consolidateMaterials({ candidates, documents });
  const units =
    firstOutlineUnits && firstOutlineTopics
      ? remapStudyUnitsToConsolidated(firstOutlineUnits, firstOutlineTopics, consolidated.topics)
      : undefined;
  const withUnits: ConsolidationResult = units?.length ? { ...consolidated, units } : consolidated;

  if (!options?.allowModel || !userId || !withUnits.ambiguous.length) return withUnits;

  try {
    const merged = await resolveAmbiguousClusters(service, userId, withUnits);
    const remappedUnits =
      firstOutlineUnits && firstOutlineTopics
        ? remapStudyUnitsToConsolidated(firstOutlineUnits, firstOutlineTopics, merged)
        : withUnits.units;
    return {
      ...withUnits,
      topics: merged,
      ambiguous: [],
      units: remappedUnits?.length ? remappedUnits : withUnits.units,
    };
  } catch {
    return withUnits;
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
