import { NextResponse, after } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { ensureTeacherAnalyses } from "@/lib/documents/teacher-analysis-run";
import { missingColumn } from "@/lib/learning/missing-column";
import { clearPendingMaterials } from "@/lib/learning/pending-materials";
import { planAddedMaterial } from "@/lib/learning/prep-add-material";
import {
  contradictionsByTopicTitleResolved,
  readContradictionDocuments,
} from "@/lib/learning/prep-contradiction-read";
import { PREP_DOCUMENT_REQUEST_MAX } from "@/lib/learning/prep-topic-list";
import { loadScheduleTopics } from "@/lib/learning/prep-schedule-topics";
import { prepSourceDocumentIds } from "@/lib/learning/prep-source";
import type { TopicSourceRef } from "@/lib/learning/topic-merge";

/*
  Toplu ekleme (31 Ekim 2026, ürün sahibi: "kullanıcı sonradan da istediği kadar döküman yükleyebilir"). Önce tek
  dosya ve hazırlık başına en çok 8 dosyaydı; 100 fotoğrafı sonradan eklemek 100 istek (dakikada 12 sınırı) ve 100
  ayrı konu haritası demekti. Şimdi seçilen bütün dosyalar tek istekte: tek planla eklenir. Eski istemci (tek
  `documentId`) aynen çalışır. Belge sayısında ürün sınırı yok; sayfa, fotoğraf ve kredi hakkı sınırlar.
*/
const bodySchema = z
  .object({
    prepId: z.string().uuid(),
    documentId: z.string().uuid().optional(),
    documentIds: z.array(z.string().uuid()).min(1).max(PREP_DOCUMENT_REQUEST_MAX).optional(),
  })
  .refine((body) => Boolean(body.documentId || body.documentIds?.length));

/** Bu kadar yeni dosyaya kadar öğretmen analizi yanıttan önce beklenir; fazlası arka planda. */
const ANALYSIS_INLINE_MAX = 3;

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

/**
 * Var olan hazırlığa yeni dosya.
 * Yalnızca bu dosyanın saklı analizi okunur; eski dosyalar yeniden üretilmez.
 * Bitmiş düğüm, puan ve hazırlık skoru yazılmaz.
 */
export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-prep-add-source", limit: 12 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");
  const { prepId } = parsed.data;
  const requested = [...new Set([...(parsed.data.documentIds ?? []), ...(parsed.data.documentId ? [parsed.data.documentId] : [])])];

  const prepResult = await service
    .from("exam_preps")
    .select("id, document_id, source_document_ids, readiness_score")
    .eq("id", prepId)
    .eq("user_id", userId)
    .maybeSingle();
  if (prepResult.error || !prepResult.data) return errorResponse(404, "not_found");

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
    return NextResponse.json({ ok: true, already: true, addedTopics: 0, mergedTopics: 0, addedDocuments: 0 });
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
  if (newDocumentIds.length !== fresh.length) return errorResponse(404, "not_found");

  // Öğretmen analizi: hazır satır varsa model çağrılmaz. Az dosyada yanıttan önce (eski davranış), çok dosyada arka
  // planda — belge işlenirken zaten başlamıştı; ilk ders onu bekler (TEACHER_ANALYSIS_WAIT_MS).
  if (newDocumentIds.length <= ANALYSIS_INLINE_MAX) {
    await ensureTeacherAnalyses(service, { userId, documentIds: newDocumentIds }).catch(() => undefined);
  } else {
    after(() => ensureTeacherAnalyses(service, { userId, documentIds: newDocumentIds }).catch(() => undefined));
  }

  const loaded = await loadScheduleTopics(service, newDocumentIds, []);
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
  const incoming = loaded.scheduleTopics.map((topic) => ({
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
      if (!missingColumn(rich.error)) return errorResponse(500, "generation_failed");
      const plain = await service.from("exam_prep_topics").insert(
        plan.topicInserts.map((topic) => ({
          exam_prep_id: prepId,
          label: topic.label,
          sort_order: topic.sortOrder,
          status: topic.status,
        })),
      );
      if (plain.error) return errorResponse(500, "generation_failed");
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
    if (inserted.error) return errorResponse(500, "generation_failed");
  }
  await clearPendingMaterials(service, { prepId, userId, documentIds: requested });

  return NextResponse.json({
    ok: true,
    addedDocuments: newDocumentIds.length,
    addedTopics: plan.topicInserts.length,
    mergedTopics: plan.topicUpdates.length,
    warnings: [...plan.topicUpdates, ...plan.topicInserts]
      .map((topic) => topic.warning)
      .filter(Boolean),
    readinessScore: plan.readinessScore,
  });
}
