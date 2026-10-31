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
    .select("id, document_id, source_document_ids, readiness_score")
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

  const loaded = await loadScheduleTopics(service, newDocumentIds, [], userId);
  // Hızlı başlatma (31 Ekim 2026): hazırlık belgenin baş kopyasıyla kurulduysa o sayfaların konuları zaten yolda;
  // ana belgeden yalnız sonraki sayfaların konuları eklenir.
  const headCoverage = await headCoverageFor(service, { userId, sourceDocumentIds: existingDocumentIds, documentIds: newDocumentIds });
  const scheduleTopics = headCoverage.size
    ? loaded.scheduleTopics.filter((topic) => topicPastHead(topic, headCoverage))
    : loaded.scheduleTopics;
  const readinessScore =
    typeof prepResult.data.readiness_score === "number" ? prepResult.data.readiness_score : 0;

  const richTopics = await service
    .from("exam_prep_topics")
    .select("id, label, sort_order, status, source_refs")
    .eq("exam_prep_id", prepId)
    .order("sort_order");
  const topicRows = richTopics.error && missingColumn(richTopics.error)
    ? (
        await service
          .from("exam_prep_topics")
          .select("id, label, sort_order, status")
          .eq("exam_prep_id", prepId)
          .order("sort_order")
      ).data
    : richTopics.data;

  const { data: nodeRows } = await service
    .from("exam_prep_nodes")
    .select("id, title, sort_order, status, kind, day_index")
    .eq("exam_prep_id", prepId)
    .order("sort_order");

  const contradictionDocs = await readContradictionDocuments(service, [
    ...existingDocumentIds,
    ...newDocumentIds,
  ]).catch(() => []);
  const incoming = scheduleTopics.map((topic) => ({
    title: topic.title,
    pages: topic.pageNumbers ?? [],
    sources: topic.sourceRefs ?? [],
    prerequisites: topic.prerequisites ?? [],
    nodeIds: topic.sourceRefs?.map((source) => source.nodeId).filter((id): id is string => Boolean(id)) ?? [],
  }));
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
  }
  for (const topic of plan.topicSortUpdates) {
    await service
      .from("exam_prep_topics")
      .update({ sort_order: topic.sortOrder })
      .eq("id", topic.id)
      .eq("exam_prep_id", prepId);
  }
  if (plan.topicInserts.length) {
    const rich = await service.from("exam_prep_topics").insert(
      plan.topicInserts.map((topic) => ({
        exam_prep_id: prepId,
        label: topic.label,
        sort_order: topic.sortOrder,
        status: topic.status,
        source_refs: topic.sourceRefs,
        contradictions: topic.contradictions,
      })),
    );
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
        session_meta: { topicTitle: node.topicTitle, role: "learn" },
      })),
    );
    if (inserted.error) return { ok: false, status: 500, code: "generation_failed" };
  }
  await clearPendingMaterials(service, { prepId, userId, documentIds: requested });

  return {
    ok: true,
    addedDocuments: newDocumentIds.length,
    addedTopics: plan.topicInserts.length,
    mergedTopics: plan.topicUpdates.length,
    warnings: [...plan.topicUpdates, ...plan.topicInserts]
      .map((topic) => topic.warning)
      .filter((warning): warning is string => Boolean(warning)),
    readinessScore: plan.readinessScore,
  };
}
