/**
 * Yol etkinliği ucunun ortak kabuğu: gövde ayrıştırma, hazırlık ve düğüm okuma, kilit, konu ve kayıtlı seçimler.
 * Her eylem buradan geçer; dönen bağlam eylem modüllerine aynen verilir. Sıra sözleşmedir (sözleşme testi).
 */
import "server-only";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { errorResponse } from "@/lib/api/guards";
import { PDF_LEARNING_V2_FLAG, isFeatureEnabled } from "@/lib/admin/feature-flags";
import { PLAN_NODE_META, type PlanNodeKind } from "@/lib/learning/exam-prep-plan";
import { nodeNeedsStudentUnlock, studentMayStartNode, topicLabelsMatch } from "@/lib/learning/study-tools";
import { prepTopicMatch } from "@/lib/learning/prep-topic-lookup";
import { safeTopicIds, topicIdsOf } from "@/lib/learning/topic-identity";
import { isOralLength } from "@/lib/learning/oral-exam";
import { parseFamiliarity, parseMood } from "@/lib/learning/session-signals";
import { parseSessionMeta } from "@/lib/learning/teaching-standards";
import { bodySchema } from "@/lib/learning/node/schema";
import { loadLessonReviewCards } from "@/lib/learning/node/misconceptions";

export type NodeCaller = { userId: string; service: SupabaseClient };
export type NodeRequestOptions = { origin: string; prefetchNodeId: string | null };

/** Kimlik doğrulanmış istek → bağlam. Erken yanıt (geçersiz gövde, bulunamadı, kilitli, choose) `Response` döner. */
export async function loadNodeContext(ctx: NodeCaller, rawBody: unknown, options: NodeRequestOptions) {
  const { userId, service } = ctx;
  // Soğuk dersin rota zaman çizgisi (19 Ekim 2026): motor ilk kavramı 9,8 sn'de yayımlarken
  // öğrenci ilk ekranı 15 sn'de gördü — aradaki ~5 sn rotada. Nerede olduğu kayda yazılır.
  const requestStarted = Date.now();

  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const { prepId, nodeId, action } = parsed.data;
  const lessonFormat: 2 | 3 = parsed.data.lessonFormat === 3 ? 3 : 2;
  // Önceden yazım yalnız imzalı iç istekten, imzadaki düğüm için.
  const prefetch = options.prefetchNodeId !== null;
  if (prefetch && (parsed.data.prefetch !== true || options.prefetchNodeId !== nodeId || action !== "start")) {
    return errorResponse(400, "invalid_input");
  }
  if (!prefetch && parsed.data.prefetch) return errorResponse(400, "invalid_input");
  const teachingV2 = await isFeatureEnabled(service, PDF_LEARNING_V2_FLAG);

  const { data: prep } = await service
    .from("exam_preps")
    .select(
      "id, title, exam_type, active_topic_id, target_score, learning_preferences, hard_topics_self",
    )
    .eq("id", prepId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!prep) return errorResponse(404, "not_found");

  const { data: node } = await service
    .from("exam_prep_nodes")
    .select("id, kind, title, status, sort_order, day_index, session_meta")
    .eq("id", nodeId)
    .eq("exam_prep_id", prepId)
    .maybeSingle();
  if (!node) return errorResponse(404, "not_found");
  // Öğrencinin kendi düğümü kilitliyken açılır (27 Ekim 2026). Gizli düğüm açılmaz.
  // Önceden yazım durumu değiştirmez. Bitirme kilitli düğümü reddettiği için giriş önce ready yapar.
  if (action === "choose") {
    if (nodeNeedsStudentUnlock(node.status)) {
      await service.from("exam_prep_nodes").update({ status: "ready" }).eq("id", nodeId).eq("status", "locked");
    }
    return NextResponse.json({ ok: true });
  }
  if (!prefetch && nodeNeedsStudentUnlock(node.status)) {
    await service.from("exam_prep_nodes").update({ status: "ready" }).eq("id", nodeId).eq("status", "locked");
  }
  if (!studentMayStartNode(node.status, node.kind as string) && !prefetch) return errorResponse(403, "node_locked");

  // `let`: hazırlık geneli düğüm zayıf konuya yönelebilir (aşağıda `retargetNodeTopic`).
  const sessionMeta = teachingV2 ? parseSessionMeta(node.session_meta) : null;
  const topicLookupId = sessionMeta?.topicId ?? prep.active_topic_id;
  // Belgeli hazırlıkta düğüm belgedeki konu düğümünü tutar; yalnız `id` ile arama konuyu bulmaz
  // (18 Ekim 2026: aşinalık kaydedilmiyor, konunun sayfa eşlemesi atlanıyordu).
  const topicMatch = topicLookupId ? prepTopicMatch(topicLookupId) : null;

  const { data: topic } = topicMatch
    ? await service
        .from("exam_prep_topics")
        .select("id, label, measured_level, document_topic_node_id, source_refs")
        .eq("exam_prep_id", prepId)
        .or(topicMatch)
        .limit(1)
        .maybeSingle()
    : await service
        .from("exam_prep_topics")
        .select("id, label, measured_level, document_topic_node_id, source_refs")
        .eq("exam_prep_id", prepId)
        .order("sort_order")
        .limit(1)
        .maybeSingle();

  let topicDocumentId: string | null = null;
  let topicNodeId: string | null = null;
  const topicSourceRefs = topic?.source_refs ?? null;
  if (topic?.id) {
    const nodeIdForTopic =
      typeof topic.document_topic_node_id === "string"
        ? topic.document_topic_node_id
        : null;
    topicNodeId = nodeIdForTopic;
    if (nodeIdForTopic) {
      const { data: topicNode } = await service
        .from("document_topic_nodes")
        .select("document_id")
        .eq("id", nodeIdForTopic)
        .maybeSingle();
      if (topicNode?.document_id) topicDocumentId = topicNode.document_id as string;
    }
  }

  const kind = node.kind as PlanNodeKind;
  let topicLabel =
    sessionMeta?.topicTitle?.trim() || topic?.label || prep.title || "Konu";
  const oralCount = isOralLength(parsed.data.oralQuestionCount ?? 0)
    ? parsed.data.oralQuestionCount
    : undefined;
  const requestedTopic = (
    (kind === "oral" ? parsed.data.oralTopicLabel?.trim() : "") ||
    parsed.data.activityTopicLabel?.trim() ||
    ""
  ).slice(0, 400);
  if (requestedTopic) topicLabel = requestedTopic;
  // Sözlüde seçilen konular kimlikle (30 Ekim 2026, `topic-identity.ts`). Canlı tur: "Enflasyon Türleri" seçilen sözlü
  // başka konunun düğümünde açıldı; ad düğümün konusuyla tutmayınca kaynak "konuyu genişlet" diye hazırlık adıyla
  // aranıyor, sorular üç konudan geliyordu. Tek konu → o konunun kaydı ve sayfaları (`retargetNodeTopic`); birden çok
  // konu → her konunun kendi sayfaları ve tek konuya kanıt yok (`scope: "topics"`); düğümün kendi konusu → genişletme yok.
  const oralTopicIds =
    kind === "oral" && parsed.data.oralScope !== "all" ? safeTopicIds(parsed.data.oralTopicIds) : [];
  const oralMultiTopic = oralTopicIds.length > 1;
  const oralSameTopic =
    oralTopicIds.length === 1 &&
    topicIdsOf({ id: topic?.id ?? null, documentTopicNodeId: topic?.document_topic_node_id ?? null }).includes(oralTopicIds[0]!);
  if (oralSameTopic && topic?.label) topicLabel = topic.label;
  const topicWiden =
    (kind === "oral" && parsed.data.oralScope === "all") ||
    oralMultiTopic ||
    (!oralSameTopic && Boolean(requestedTopic && !topicLabelsMatch(requestedTopic, sessionMeta?.topicTitle)));
  const difficulty = parsed.data.difficulty ?? "orta";
  const voiceMode = parsed.data.voiceMode ?? false;
  const familiarity = parseFamiliarity(parsed.data.familiarity);
  const mood = parseMood(parsed.data.mood);
  const title = PLAN_NODE_META[kind]?.setupLabel ?? node.title;
  const lessonReviewCards =
    kind === "spaced"
      ? await loadLessonReviewCards(service, userId, prepId, requestedTopic || sessionMeta?.topicTitle?.trim() || topic?.label || null)
      : [];

  return {
    userId,
    service,
    options,
    requestStarted,
    parsed,
    prepId,
    nodeId,
    action,
    lessonFormat,
    prefetch,
    teachingV2,
    prep,
    node,
    sessionMeta,
    topic,
    topicDocumentId,
    topicNodeId,
    topicSourceRefs,
    kind,
    topicLabel,
    oralCount,
    requestedTopic,
    oralTopicIds,
    oralMultiTopic,
    oralSameTopic,
    topicWiden,
    difficulty,
    voiceMode,
    familiarity,
    mood,
    title,
    lessonReviewCards,
  };
}

/** Eylem modüllerinin okuduğu bağlam (`loadNodeContext`'in erken yanıt dışındaki dönüşü). */
export type NodeContext = Exclude<Awaited<ReturnType<typeof loadNodeContext>>, Response>;
