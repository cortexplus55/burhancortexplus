import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConsolidatedTopic, ExcludedTopicNote } from "@/lib/learning/cross-material-topics";
import { loadPagedDocumentRows } from "@/lib/learning/paged-document-rows";
import {
  examWeightToEmphasis,
  isHighExamWeight,
  readExamWeightFromRelations,
  readStageFromRelations,
  sharedCourseTag,
  unpackTopicPerspective,
  type ExamWeight,
  type UnitStage,
} from "@/lib/documents/outline-topic-meta";
import { pageUsableForLesson } from "@/lib/documents/page-analysis";
import { documentKind } from "@/lib/documents/document-filter";
import {
  consolidateFragmentedTopics,
  unitLessonGroups,
  type ConsolidationDocument,
  type ConsolidationResult,
  type UnitLessonGroup,
  type UnitLessonPart,
} from "@/lib/learning/topic-consolidation";
import { splitExcludedTopics } from "@/lib/learning/topic-scope";

export type IntakeStudyUnit = {
  title: string;
  topicIndexes: number[];
  /** Ünite düğümünün öğrenme basamağı (Faz 10); eski haritada yok. */
  stage?: UnitStage;
  examWeight?: ExamWeight;
};

type IntakeNode = Record<string, unknown> & { documentId: string; fileName: string };

const bySortOrder = (a: Record<string, unknown>, b: Record<string, unknown>) =>
  (typeof a.sort_order === "number" ? a.sort_order : 0) -
  (typeof b.sort_order === "number" ? b.sort_order : 0);

/**
 * Load outline maps without consolidate/reorder. Files outlined together
 * (unit nodes tagged with the same course) merge back into that ONE order;
 * otherwise each file's map follows the previous one. Returns null when any
 * document is still flat/legacy so the caller can fall back.
 */
export async function loadOneshotIntakeTopics(
  service: SupabaseClient,
  userId: string,
  documentIds: string[],
): Promise<{ topics: ConsolidatedTopic[]; units: IntakeStudyUnit[] } | null> {
  if (!documentIds.length) return null;
  const perDoc: IntakeNode[][] = [];
  const pagesByTopic = new Map<string, number[]>();
  for (const documentId of documentIds) {
    const { data: doc } = await service
      .from("documents")
      .select("id, file_name, topic_map_status")
      .eq("id", documentId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!doc || (doc.topic_map_status !== "ready" && doc.topic_map_status !== "reviewed")) {
      return null;
    }
    const fileName = (doc.file_name as string | null) ?? "";
    const nodeRows = await loadPagedDocumentRows(
      service,
      "document_topic_nodes",
      "id, title, parent_id, sort_order, prerequisites, learning_objective, key_definitions, key_relations, document_id",
      [documentId],
      ["sort_order", "id"],
    );
    perDoc.push(nodeRows.map((n) => ({ ...n, documentId, fileName })));
    const links = await loadPagedDocumentRows(
      service,
      "document_topic_page_links",
      "topic_id, page_number, document_id",
      [documentId],
      ["topic_id", "page_number"],
    );
    for (const link of links) {
      const list = pagesByTopic.get(link.topic_id as string) ?? [];
      list.push(link.page_number as number);
      pagesByTopic.set(link.topic_id as string, list);
    }
  }

  // Aynı kursun herhangi bir alt kümesi kursun tek sırasıyla okunur (Paket I): kurulumdan bir belge —
  // ilki de olsa — çıkarılınca kalanların konuları yerinde kalır, harita sıfırdan yazılmaz.
  const isCourse =
    documentIds.length > 1 &&
    sharedCourseTag(
      perDoc.map((nodes) =>
        nodes.map((n) => ({ parent_id: (n.parent_id as string | null) ?? null, key_relations: n.key_relations })),
      ),
    ) !== null;
  if (!isCourse && perDoc.some((nodes) => !nodes.some((n) => n.parent_id != null))) return null;

  const topics: ConsolidatedTopic[] = [];
  const units: IntakeStudyUnit[] = [];
  for (const nodes of isCourse ? [perDoc.flat()] : perDoc) {
    const parentIds = new Set(nodes.map((n) => n.parent_id).filter(Boolean) as string[]);
    // Kursta ünite her dosyaya ayrı yazılıyor; konuları başka dosyada kalan ünitenin bu dosyadaki kopyası çocuksuz
    // ve sayfasız. Konu sayılırsa listenin başına "Diğer" olarak düşüyor, dersi kaynaksız (PDF'in 1. sayfasından)
    // yazılıyordu (24 Ekim 2026 lansman testi). Sayfası olmayan üst düğüm konu değildir.
    const leaves = nodes
      .filter((n) => !parentIds.has(n.id as string))
      .filter((n) => !isCourse || n.parent_id != null || (pagesByTopic.get(n.id as string)?.length ?? 0) > 0)
      .sort(bySortOrder);
    if (!leaves.length || leaves.length > 40) return null;
    // A course unit spanning files is stored once per file with the same order.
    const unitByOrder = new Map<
      number,
      { title: string; ids: Set<string>; stage: UnitStage | null; examWeight: ExamWeight | null }
    >();
    for (const parent of nodes.filter((n) => parentIds.has(n.id as string)).sort(bySortOrder)) {
      const order = typeof parent.sort_order === "number" ? parent.sort_order : 0;
      const unit = unitByOrder.get(order) ?? {
        title: String(parent.title ?? ""),
        ids: new Set(),
        stage: readStageFromRelations(parent.key_relations),
        examWeight: readExamWeightFromRelations(parent.key_relations),
      };
      unit.ids.add(parent.id as string);
      unitByOrder.set(order, unit);
    }
    const baseIndex = topics.length;
    for (const leaf of leaves) {
      const perspective = unpackTopicPerspective({
        learning_objective: leaf.learning_objective as string | null,
        prerequisites: leaf.prerequisites,
        key_definitions: leaf.key_definitions,
        key_relations: leaf.key_relations,
      });
      const pages = [...new Set(pagesByTopic.get(leaf.id as string) ?? [])].sort((a, b) => a - b);
      const emphasis = examWeightToEmphasis(perspective.examWeight);
      topics.push({
        title: String(leaf.title ?? ""),
        summary: (perspective.whyLearn ?? "").slice(0, 400),
        sections: [],
        pages,
        sources: [{ documentId: leaf.documentId, fileName: leaf.fileName, pages, nodeId: leaf.id as string }],
        sourceCount: 1,
        prerequisites: perspective.prerequisiteTitles,
        weightPercent: null,
        examHeavy: isHighExamWeight(perspective.examWeight),
        importance: emphasis === "core" ? "important" : emphasis === "skim" ? "less" : "medium",
        scopeNote: null,
        commonMistakes: [],
        practiceItems: [],
        nodeIds: [leaf.id as string],
        syllabusIndex: null,
      });
    }
    for (const unit of unitByOrder.values()) {
      const topicIndexes = leaves
        .map((leaf, i) => (unit.ids.has(leaf.parent_id as string) ? baseIndex + i : -1))
        .filter((i) => i >= 0);
      if (topicIndexes.length) {
        units.push({
          title: unit.title,
          topicIndexes,
          ...(unit.stage ? { stage: unit.stage } : {}),
          ...(unit.examWeight ? { examWeight: unit.examWeight } : {}),
        });
      }
    }
  }
  if (!topics.length) return null;
  return { topics, units };
}

/** İnce konuları süzer, ünitelerin konu sıralarını yeniden numaralar (boşalan ünite düşer). */
function keepLeaves<T, U extends { topicIndexes: number[] }>(
  input: { topics: T[]; units: U[]; excluded: ExcludedTopicNote[] },
  keep: (leaf: T) => boolean,
): { topics: T[]; units: U[]; excluded: ExcludedTopicNote[] } {
  const newIndex = new Map<number, number>();
  const topics: T[] = [];
  input.topics.forEach((topic, index) => {
    if (!keep(topic)) return;
    newIndex.set(index, topics.length);
    topics.push(topic);
  });
  const units = input.units
    .map((unit) => ({
      ...unit,
      topicIndexes: unit.topicIndexes.flatMap((index) => (newIndex.has(index) ? [newIndex.get(index)!] : [])),
    }))
    .filter((unit) => unit.topicIndexes.length);
  return { topics, units, excluded: input.excluded };
}

/** Ana ünite (Faz 10): konu listesinin bir satırı; ince konular `subtopics`. */
export type IntakeMainTopic = ConsolidatedTopic & {
  subtopics: string[];
  /** Ünitenin dersleri: tek grup tek ders (en çok 12 öğretilebilir sayfa), fazlası alt başlık gruplarına göre. */
  lessonGroups: UnitLessonGroup[];
  stage?: UnitStage;
};

/** Konu haritasının belge ölçüsü: öğretilebilir sayfalar ve karakter (gürültü sayfası dışarıda). Okunamazsa null. */
export async function loadConsolidationDocuments(
  service: SupabaseClient,
  documents: readonly { documentId: string; fileName: string }[],
): Promise<ConsolidationDocument[] | null> {
  if (!documents.length) return [];
  try {
    const rows = await loadPagedDocumentRows(
      service,
      "document_pages",
      "document_id, page_number, page_kind, char_count, text_content",
      documents.map((doc) => doc.documentId),
      ["page_number"],
    );
    const byDoc = new Map<string, Record<string, unknown>[]>();
    for (const row of rows) {
      const list = byDoc.get(row.document_id as string) ?? [];
      list.push(row);
      byDoc.set(row.document_id as string, list);
    }
    return documents.map(({ documentId, fileName }) => {
      const usablePages: number[] = [];
      const pageChars: Record<number, number> = {};
      for (const row of byDoc.get(documentId) ?? []) {
        if (!pageUsableForLesson(row)) continue;
        const page = row.page_number as number;
        const text = String(row.text_content ?? "");
        usablePages.push(page);
        const stored = typeof row.char_count === "number" ? row.char_count : 0;
        pageChars[page] = stored > 0 ? stored : text.trim().length;
      }
      return { documentId, kind: documentKind(fileName), usablePages, pageChars };
    });
  } catch {
    return null;
  }
}

/**
 * Konu listesini ana ünitelere indirir (Faz 10, `topic-consolidation.ts`): sihirbazın gösterdiği ve kurulumun yazdığı
 * liste aynı işlevden çıkar. Belgenin "kapsam dışı" dediği ince konu üniteye girmez (Paket I kuralı yaprak düzeyinde).
 * Konu haritası hazır değilse (eski / düz harita) null: çağıran eski yola döner.
 */
export async function loadIntakeMainUnits(
  service: SupabaseClient,
  userId: string,
  documentIds: string[],
  options: {
    exclusionPhrases?: readonly string[];
    /** İnce konu süzgeci (ünite kurulmadan önce): sonradan eklenen büyük belgenin baş sayfaları gibi. */
    keepLeaf?: (leaf: ConsolidatedTopic) => boolean;
  } = {},
): Promise<{ topics: IntakeMainTopic[]; excluded: ExcludedTopicNote[]; consolidation: ConsolidationResult } | null> {
  const outline = await loadOneshotIntakeTopics(service, userId, documentIds);
  if (!outline) return null;
  const excludedScope = splitExcludedTopics(outline.topics, outline.units, options.exclusionPhrases ?? []);
  const scoped = options.keepLeaf ? keepLeaves(excludedScope, options.keepLeaf) : excludedScope;
  const leaves = scoped.topics;
  if (!leaves.length) return null;
  const fileOf = new Map<string, string>();
  for (const leaf of leaves) {
    for (const source of leaf.sources) if (!fileOf.has(source.documentId)) fileOf.set(source.documentId, source.fileName);
  }
  const measured = await loadConsolidationDocuments(
    service,
    [...fileOf].map(([documentId, fileName]) => ({ documentId, fileName })),
  );
  const cited = new Set(
    leaves.flatMap((leaf) => leaf.sources.flatMap((source) => source.pages.map((page) => `${source.documentId}:${page}`))),
  );
  const consolidation = consolidateFragmentedTopics({
    topics: leaves.map((leaf) => ({
      title: leaf.title,
      documentId: leaf.sources[0]?.documentId ?? "",
      fileName: leaf.sources[0]?.fileName ?? "",
      nodeId: leaf.nodeIds[0] ?? null,
      pages: leaf.pages,
      examWeight: leaf.examHeavy ? "high" : leaf.importance === "less" ? "low" : "medium",
    })),
    units: scoped.units.map((unit) => ({
      title: unit.title,
      examWeight: unit.examWeight,
      stage: unit.stage ?? null,
      topics: unit.topicIndexes,
    })),
    documents: measured ?? [],
    // Sayfalar okunamazsa haritanın alıntıladığı sayfalar etkin sayfadır (bant küçülüp üniteler gereksiz birleşmesin).
    ...(measured ? {} : { effectivePageCount: cited.size }),
  });
  const usableByDoc = new Map((measured ?? []).map((doc) => [doc.documentId, new Set(doc.usablePages)]));
  const fold = (title: string) => title.trim().toLocaleLowerCase("tr");
  const unitOfLeaf = new Map<string, string>();
  for (const unit of consolidation.units) {
    for (const index of unit.topicIndexes) unitOfLeaf.set(fold(leaves[index]!.title), unit.title);
  }
  const topics: IntakeMainTopic[] = consolidation.units.map((unit) => {
    const members = unit.topicIndexes.map((index) => leaves[index]!);
    const own = new Set([unit.title, ...unit.subtopics].map(fold));
    // Önkoşul bir ince konunun adıydı; o konu artık başka bir ünitenin alt başlığı: önkoşul o ünitedir.
    const prerequisites = [
      ...new Set(
        members
          .flatMap((leaf) => leaf.prerequisites)
          .map((title) => unitOfLeaf.get(fold(title)) ?? title)
          .filter((title) => !own.has(fold(title))),
      ),
    ];
    const leafOf = (item: { topicIndex: number | null }) => (item.topicIndex == null ? null : leaves[item.topicIndex]!);
    const parts: UnitLessonPart[] = unit.items.map((item) => {
      const leaf = leafOf(item);
      return { title: item.title, documentId: leaf?.sources[0]?.documentId ?? "", pages: leaf?.pages ?? [] };
    });
    const sections = unit.items.map((item) => {
      const leaf = leafOf(item);
      return {
        title: item.title,
        pages: leaf ? [...leaf.pages] : [],
        sources: leaf ? leaf.sources.map((source) => ({ ...source, pages: [...source.pages] })) : [],
      };
    });
    return {
      title: unit.title,
      summary: "",
      sections,
      pages: unit.pages,
      sources: unit.sourceRefs,
      sourceCount: new Set(unit.sourceRefs.map((ref) => ref.documentId)).size,
      prerequisites,
      weightPercent: null,
      examHeavy: unit.examWeight === "high",
      importance: unit.examWeight === "high" ? "important" : unit.examWeight === "low" ? "less" : "medium",
      scopeNote: null,
      commonMistakes: [],
      practiceItems: [],
      nodeIds: unit.topicNodeIds,
      syllabusIndex: null,
      subtopics: unit.subtopics,
      lessonGroups: unitLessonGroups(parts, (documentId) => usableByDoc.get(documentId) ?? null),
      ...(unit.stage ? { stage: unit.stage } : {}),
    };
  });
  console.info("intake_main_units", {
    leaves: leaves.length,
    units: topics.length,
    effectivePages: consolidation.effectivePageCount,
    band: consolidation.band,
    droppedNoise: consolidation.droppedNoise.length,
    stageOrdered: consolidation.stageOrdered,
  });
  if (!topics.length) return null;
  return { topics, excluded: scoped.excluded, consolidation };
}
