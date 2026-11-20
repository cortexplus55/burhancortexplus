import "server-only";
import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureTeacherAnalyses } from "@/lib/documents/teacher-analysis-run";
import { missingColumn } from "@/lib/learning/missing-column";
import { clearPendingMaterials } from "@/lib/learning/pending-materials";
import { headCoverageFor, topicPastHead } from "@/lib/documents/document-head";
import { planAddedMaterial } from "@/lib/learning/prep-add-material";
import {
  contradictionsByTopicTitleResolved,
  readContradictionDocuments,
} from "@/lib/learning/prep-contradiction-read";
import { loadScheduleTopics } from "@/lib/learning/prep-schedule-topics";
import { prepSourceDocumentIds } from "@/lib/learning/prep-source";
import type { TopicSourceRef } from "@/lib/learning/topic-merge";
import { EXTRA_TOPIC_PREFIX, matchUnit, type UnitCandidate } from "@/lib/content-pool/attach-match";
import { poolUnitForTopic } from "@/lib/content-pool/serve";
import { isUnitTopicRow, nodesUseUnits, parseSubtopics } from "@/lib/learning/unit-topic-row";
import { mergeSubtopics } from "@/lib/learning/topic-consolidation";
import { unitSourcesOf } from "@/lib/learning/exam-schedule-v2";
import { parseUnitSources } from "@/lib/learning/teaching-standards";

type AttachTopicRow = Record<string, unknown>;
type AttachNodeRow = { id: unknown; sort_order: unknown; status: unknown; kind: unknown; session_meta?: unknown };

/** Konu satırları: alt başlıklarla (Faz 10); sütunlar yoksa (göç uygulanmadı) eski seçimler sırayla. */
async function loadAttachTopicRows(service: SupabaseClient, prepId: string): Promise<AttachTopicRow[] | null> {
  const selects = [
    "id, label, sort_order, status, source_refs, document_topic_node_id, subtopics",
    "id, label, sort_order, status, source_refs, document_topic_node_id",
    "id, label, sort_order, status, source_refs",
    "id, label, sort_order, status",
  ];
  for (const [index, select] of selects.entries()) {
    const result = await service.from("exam_prep_topics").select(select).eq("exam_prep_id", prepId).order("sort_order");
    if (!result.error || index === selects.length - 1 || !missingColumn(result.error)) {
      return (result.data ?? null) as AttachTopicRow[] | null;
    }
  }
  return null;
}

/** Düğümün konu kimliği bu satırın mı (satır kimliği ya da belge konu düğümü). */
function nodeOfTopic(row: AttachTopicRow | undefined, node: AttachNodeRow): boolean {
  if (!row) return false;
  const meta = node.session_meta && typeof node.session_meta === "object" ? (node.session_meta as { topicId?: unknown }) : null;
  const topicId = typeof meta?.topicId === "string" ? meta.topicId : null;
  return Boolean(topicId) && (topicId === row.id || topicId === row.document_topic_node_id);
}

/** Ünitenin alt başlıkları: satırdan; göçten önce kurulduysa ders düğümlerinden. */
function unitSubtopicsOf(row: AttachTopicRow, nodes: readonly AttachNodeRow[]): string[] {
  const own = parseSubtopics(row.subtopics);
  if (own.length) return own;
  return mergeSubtopics(
    [],
    nodes
      .filter((node) => nodeOfTopic(row, node))
      .flatMap((node) => parseSubtopics((node.session_meta as { lessonSubtopics?: unknown } | null)?.lessonSubtopics)),
  );
}

/**
 * Yeni kaynak alan ünitenin dersi (Faz 10): yeni alt başlıklar ve kaynak ünitenin SON bitmemiş dersine eklenir
 * (öncekiler kendi gruplarını anlatır). Ders dışı adımlar (test, kart, podcast …) ünitenin kaynağını açılışta satırdan
 * okur, güncelleme istemez. Bitmiş adım, puan ve hâkimiyet değişmez; bütün dersleri bitmiş ünitede yazım yok.
 */
export function unitNodeRefreshes(
  row: AttachTopicRow | undefined,
  nodes: readonly AttachNodeRow[],
  added: readonly TopicSourceRef[],
  subtopics: readonly string[],
): { id: string; meta: Record<string, unknown> }[] {
  const addedSources = unitSourcesOf({ sourceRefs: [...added] });
  if (!addedSources.length) return [];
  const lessons = nodes
    .filter((node) => node.kind === "lesson" && nodeOfTopic(row, node))
    .sort((a, b) => Number(a.sort_order) - Number(b.sort_order));
  const last = [...lessons].reverse().find((node) => String(node.status) !== "done");
  const meta = last?.session_meta && typeof last.session_meta === "object" ? { ...(last.session_meta as Record<string, unknown>) } : null;
  if (!last || !meta || !Array.isArray(meta.unitSources)) return [];
  meta.unitSources = unitSourcesOf({
    sourceRefs: [...parseUnitSources(meta.unitSources), ...addedSources].map((ref) => ({ ...ref, fileName: "", nodeId: null })),
  });
  const taught = lessons
    .filter((other) => other !== last)
    .flatMap((other) => parseSubtopics((other.session_meta as { lessonSubtopics?: unknown } | null)?.lessonSubtopics));
  meta.lessonSubtopics = mergeSubtopics(
    parseSubtopics(meta.lessonSubtopics),
    subtopics.filter((title) => !taught.includes(title)),
  );
  return [{ id: String(last.id), meta }];
}

/*
  Var olan hazırlığa okunmuş ve haritalanmış belge ekler (31 Ekim 2026). "Materyal ekle" ucu (add-source) ve büyük
  belgenin pencere işçisi (pending-windows.ts) aynı yoldan geçer: işçi her pencerenin kopyasını haritaladıktan sonra
  bunu doğrudan çağırır, istemciye dönmez. Bitmiş düğüm, puan ve hazırlık skoru yazılmaz.
*/

export type AttachResult =
  | {
      ok: true;
      already?: boolean;
      addedDocuments: number;
      addedTopics: number;
      mergedTopics: number;
      warnings: string[];
      readinessScore?: number;
    }
  | { ok: false; status: 404 | 500; code: "not_found" | "generation_failed" };

function asSources(value: unknown): TopicSourceRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as Partial<TopicSourceRef>;
    return [
      {
        documentId: typeof row.documentId === "string" ? row.documentId : "",
        fileName: typeof row.fileName === "string" ? row.fileName : "",
        pages: Array.isArray(row.pages)
          ? row.pages.filter((page): page is number => typeof page === "number")
          : [],
        nodeId: typeof row.nodeId === "string" ? row.nodeId : null,
      },
    ];
  });
}

export async function attachDocumentsToPrep(
  service: SupabaseClient,
  input: { userId: string; prepId: string; documentIds: string[] },
): Promise<AttachResult> {
  const { userId, prepId } = input;
  const requested = [...new Set(input.documentIds)];

  const prepResult = await service
    .from("exam_preps")
    .select("id, document_id, source_document_ids, readiness_score, learning_preferences")
    .eq("id", prepId)
    .eq("user_id", userId)
    .maybeSingle();
  if (prepResult.error || !prepResult.data) return { ok: false, status: 404, code: "not_found" };

  const existingDocumentIds = prepSourceDocumentIds({
    documentId: prepResult.data.document_id as string | null,
    sourceDocumentIds: Array.isArray(prepResult.data.source_document_ids)
      ? (prepResult.data.source_document_ids as string[])
      : [],
  });
  const fresh = requested.filter((id) => !existingDocumentIds.includes(id));
  if (!fresh.length) {
    // Hızlı başlatmanın bekleyen kaydı (31 Ekim 2026): başka sekme eklediyse burada kapanır.
    await clearPendingMaterials(service, { prepId, userId, documentIds: requested });
    return { ok: true, already: true, addedTopics: 0, mergedTopics: 0, addedDocuments: 0, warnings: [] };
  }

  const { data: docs } = await service
    .from("documents")
    .select("id")
    .in("id", fresh)
    .eq("user_id", userId)
    .is("deleted_at", null);
  const owned = new Set((docs ?? []).map((row) => row.id as string));
  // Seçim sırası korunur; başkasının ya da silinmiş belge sessizce atlanmaz, istek düşer.
  const newDocumentIds = fresh.filter((id) => owned.has(id));
  if (newDocumentIds.length !== fresh.length) return { ok: false, status: 404, code: "not_found" };

  // Öğretmen analizi arkada (31 Ekim 2026): yanıtı beklemez. Canlıda 65 sayfalık taramanın eklemesi analizi 15 sn
  // bekledi; yeni konuların sınav ağırlığı kurs haritasından geliyor, analiz yalnız yedek. İlk ders analizi zaten
  // bekler (TEACHER_ANALYSIS_WAIT_MS). Hazır satır varsa model çağrılmaz.
  const analyses = ensureTeacherAnalyses(service, { userId, documentIds: newDocumentIds }).catch(() => undefined);
  after(() => analyses);

  const readinessScore =
    typeof prepResult.data.readiness_score === "number" ? prepResult.data.readiness_score : 0;

  // Ana ünite satırı (Faz 10) alt başlıklarıyla; sütun yoksa (göç uygulanmadı) eski seçimler sırayla.
  const topicRows = await loadAttachTopicRows(service, prepId);

  const { data: nodeRows } = await service
    .from("exam_prep_nodes")
    .select("id, title, sort_order, status, kind, day_index, session_meta")
    .eq("exam_prep_id", prepId)
    .order("sort_order");

  // Ana ünite modelli hazırlık (Faz 10): satırlarda alt başlık ya da düğümlerde ünite alanı. Eski hazırlık eski kuralla.
  const unitModel = (topicRows ?? []).some((row) => isUnitTopicRow(row)) || nodesUseUnits(nodeRows ?? []);

  // Hızlı başlatma (31 Ekim 2026): hazırlık belgenin baş kopyasıyla kurulduysa o sayfaların konuları zaten yolda;
  // ana belgeden yalnız sonraki sayfaların konuları eklenir. Ünite modelinde süzgeç ince konu düzeyinde (üniteler
  // kurulmadan önce): başın sayfalarındaki ince konu yeni üniteye girmez.
  const headCoverage = await headCoverageFor(service, { userId, sourceDocumentIds: existingDocumentIds, documentIds: newDocumentIds });
  const loaded = await loadScheduleTopics(
    service,
    newDocumentIds,
    [],
    userId,
    unitModel
      ? {
          mainUnits: true,
          ...(headCoverage.size ? { keepLeaf: (leaf: { sources: TopicSourceRef[] }) => topicPastHead({ sourceRefs: leaf.sources }, headCoverage) } : {}),
        }
      : {},
  );
  const scheduleTopics =
    headCoverage.size && !loaded.mainUnits
      ? loaded.scheduleTopics.filter((topic) => topicPastHead(topic, headCoverage))
      : loaded.scheduleTopics;

  const contradictionDocs = await readContradictionDocuments(service, [
    ...existingDocumentIds,
    ...newDocumentIds,
  ]).catch(() => []);
  const allIncoming = scheduleTopics.map((topic) => ({
    title: topic.title,
    pages: topic.pageNumbers ?? [],
    sources: topic.sourceRefs ?? [],
    prerequisites: topic.prerequisites ?? [],
    nodeIds: topic.sourceRefs?.map((source) => source.nodeId).filter((id): id is string => Boolean(id)) ?? [],
    ...(topic.subtopics?.length ? { subtopics: [...topic.subtopics] } : {}),
    ...(topic.lessonGroups?.length ? { lessonGroups: topic.lessonGroups } : {}),
  }));
  // Resmî kurulumlu hazırlık (2 Kasım 2026): belge konusu hazır üniteyle eşleşirse ayrı ücretli düğüm açılmaz,
  // kaynak o ünitenin konusuna bağlanır ("Senin belgenden ek"); eşleşmeyen konu "Belgendeki ek konu" diye eklenir.
  const prefs = (prepResult.data as { learning_preferences?: unknown }).learning_preferences;
  const unitCandidates: UnitCandidate[] = (topicRows ?? []).flatMap((row) => {
    const unit = poolUnitForTopic(prefs, String(row.label));
    return unit ? [{ topicId: row.id as string, unitTitle: unit.unit.title, outcomeTexts: unit.unit.outcomes.map((o) => o.text) }] : [];
  });
  const unitLinks = new Map<string, TopicSourceRef[]>();
  const incoming = unitCandidates.length
    ? allIncoming.flatMap((topic) => {
        const hit = matchUnit(topic.title, unitCandidates);
        if (!hit) return [{ ...topic, title: `${EXTRA_TOPIC_PREFIX}${topic.title}`.slice(0, 200) }];
        unitLinks.set(hit.topicId, [...(unitLinks.get(hit.topicId) ?? []), ...topic.sources]);
        return [];
      })
    : allIncoming;
  const contradictionMap = await contradictionsByTopicTitleResolved(
    service,
    userId,
    [
      ...(topicRows ?? []).map((row) => ({
        title: String(row.label),
        sources: asSources((row as { source_refs?: unknown }).source_refs).map((source) => ({
          documentId: source.documentId,
          pages: source.pages,
        })),
      })),
      ...incoming.map((topic) => ({
        title: topic.title,
        sources: topic.sources.map((source) => ({
          documentId: source.documentId,
          pages: source.pages,
        })),
      })),
    ],
    contradictionDocs,
  );

  const plan = planAddedMaterial({
    existingDocumentIds,
    newDocumentIds,
    readinessScore,
    contradictionsByTitle: contradictionMap,
    existingTopics: (topicRows ?? []).map((row) => ({
      id: row.id as string,
      label: String(row.label),
      sortOrder: row.sort_order as number,
      status: String(row.status ?? "ready"),
      sourceRefs: asSources((row as { source_refs?: unknown }).source_refs),
      ...(unitModel ? { subtopics: unitSubtopicsOf(row, nodeRows ?? []) } : {}),
    })),
    existingNodes: (nodeRows ?? []).map((row) => ({
      id: row.id as string,
      title: String(row.title),
      sortOrder: row.sort_order as number,
      status: String(row.status),
      kind: String(row.kind),
      dayIndex: (row.day_index as number) ?? 0,
    })),
    incoming,
    units: unitModel && loaded.mainUnits === true,
  });

  await service
    .from("exam_preps")
    .update({
      source_document_ids: plan.sourceDocumentIds,
      document_id: plan.sourceDocumentIds[0] ?? null,
    })
    .eq("id", prepId)
    .eq("user_id", userId);

  for (const topic of plan.topicUpdates) {
    const write = await service
      .from("exam_prep_topics")
      .update({ source_refs: topic.sourceRefs, contradictions: topic.contradictions })
      .eq("id", topic.id)
      .eq("exam_prep_id", prepId);
    if (write.error && !missingColumn(write.error)) {
      console.error("add-source topic update", write.error.message);
    }
    if (topic.subtopics?.length) {
      // Alt başlıklar ayrı: sütun yoksa (göç uygulanmadı) kaynaklar yine yazılmış olur.
      const subWrite = await service
        .from("exam_prep_topics")
        .update({ subtopics: topic.subtopics })
        .eq("id", topic.id)
        .eq("exam_prep_id", prepId);
      if (subWrite.error && !missingColumn(subWrite.error)) console.error("add-source subtopics", subWrite.error.message);
    }
    // Ünitenin henüz bitmemiş adımları yeni kaynağı ve alt başlıkları görsün (bitmiş adıma, puana dokunulmaz).
    if (topic.addedSources?.length) {
      const row = (topicRows ?? []).find((item) => item.id === topic.id);
      for (const update of unitNodeRefreshes(row, nodeRows ?? [], topic.addedSources, topic.subtopics ?? [])) {
        const nodeWrite = await service
          .from("exam_prep_nodes")
          .update({ session_meta: update.meta })
          .eq("id", update.id)
          .eq("exam_prep_id", prepId)
          .neq("status", "done");
        if (nodeWrite.error) console.error("add-source unit node", nodeWrite.error.message);
      }
    }
  }
  for (const [topicId, sources] of unitLinks) {
    const row = (topicRows ?? []).find((r) => r.id === topicId);
    const merged = [...asSources((row as { source_refs?: unknown } | undefined)?.source_refs), ...sources];
    const write = await service.from("exam_prep_topics").update({ source_refs: merged }).eq("id", topicId).eq("exam_prep_id", prepId);
    if (write.error && !missingColumn(write.error)) console.error("add-source unit link", write.error.message);
  }
  for (const topic of plan.topicSortUpdates) {
    await service
      .from("exam_prep_topics")
      .update({ sort_order: topic.sortOrder })
      .eq("id", topic.id)
      .eq("exam_prep_id", prepId);
  }
  if (plan.topicInserts.length) {
    const richRows = plan.topicInserts.map((topic) => ({
      exam_prep_id: prepId,
      label: topic.label,
      sort_order: topic.sortOrder,
      status: topic.status,
      source_refs: topic.sourceRefs,
      contradictions: topic.contradictions,
    }));
    const withSubtopics = plan.topicInserts.some((topic) => topic.subtopics?.length);
    // Ana ünite (Faz 10) alt başlıklarıyla; sütun yoksa (göç uygulanmadı) alt başlıksız aynı satırlar.
    const unitInsert = withSubtopics
      ? await service
          .from("exam_prep_topics")
          .insert(richRows.map((row, index) => ({ ...row, subtopics: plan.topicInserts[index]!.subtopics ?? [] })))
      : null;
    const rich =
      unitInsert && !(unitInsert.error && missingColumn(unitInsert.error))
        ? unitInsert
        : await service.from("exam_prep_topics").insert(richRows);
    if (rich.error) {
      if (!missingColumn(rich.error)) return { ok: false, status: 500, code: "generation_failed" };
      const plain = await service.from("exam_prep_topics").insert(
        plan.topicInserts.map((topic) => ({
          exam_prep_id: prepId,
          label: topic.label,
          sort_order: topic.sortOrder,
          status: topic.status,
        })),
      );
      if (plain.error) return { ok: false, status: 500, code: "generation_failed" };
    }
  }
  for (const node of plan.nodeSortUpdates) {
    await service
      .from("exam_prep_nodes")
      .update({ sort_order: node.sortOrder })
      .eq("id", node.id)
      .eq("exam_prep_id", prepId);
  }
  if (plan.nodeInserts.length) {
    const inserted = await service.from("exam_prep_nodes").insert(
      plan.nodeInserts.map((node) => ({
        exam_prep_id: prepId,
        kind: node.kind,
        title: node.title,
        day_index: node.dayIndex,
        sort_order: node.sortOrder,
        status: node.status,
        session_meta: {
          topicTitle: node.topicTitle,
          role: "learn",
          // Ana ünite dersi (Faz 10): alt başlıklar ve belge başına kaynak.
          ...(node.lessonSubtopics?.length ? { lessonSubtopics: node.lessonSubtopics } : {}),
          ...(node.unitSources?.length ? { unitSources: node.unitSources } : {}),
          ...(node.lessonPart && node.lessonParts ? { lessonPart: node.lessonPart, lessonParts: node.lessonParts } : {}),
        },
      })),
    );
    if (inserted.error) return { ok: false, status: 500, code: "generation_failed" };
  }
  await clearPendingMaterials(service, { prepId, userId, documentIds: requested });

  return {
    ok: true,
    addedDocuments: newDocumentIds.length,
    addedTopics: plan.topicInserts.length,
    mergedTopics: plan.topicUpdates.length + unitLinks.size,
    warnings: [...plan.topicUpdates, ...plan.topicInserts]
      .map((topic) => topic.warning)
      .filter((warning): warning is string => Boolean(warning)),
    readinessScore: plan.readinessScore,
  };
}
