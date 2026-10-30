import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import {
  FREE_PICK_NODE_KINDS,
  freeActivityPick,
  planActivityInsert,
  studyActivityHref,
  type StudyNodeRef,
  type StudyToolId,
  type StudyTopicRef,
} from "@/lib/learning/study-tools";
import { createTopicIndex } from "@/lib/learning/topic-identity";

/**
 * "Başka Bir Konu veya Etkinlik Seç" (V6): konunun seçilen etkinlik düğümü yoksa konunun bölümüne
 * eklenir ve açılır. Önce yeniden aranır: aynı anda iki tıklama ikinci düğüm açmaz.
 */
const bodySchema = z.object({
  prepId: z.string().uuid(),
  tool: z.enum(["lesson", "quiz", "true_false", "flashcards", "oral"]),
  topicId: z.string().max(200).nullable().optional(),
  topicLabel: z.string().trim().min(1).max(400),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-prep-activity", limit: 30 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");
  const { prepId, tool, topicLabel } = parsed.data;
  const topicId = parsed.data.topicId?.trim() || null;

  const { data: prep } = await service
    .from("exam_preps")
    .select("id")
    .eq("id", prepId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!prep) return errorResponse(404, "not_found");

  const { data: rows, error } = await service
    .from("exam_prep_nodes")
    .select("id, kind, status, sort_order, day_index, session_meta")
    .eq("exam_prep_id", prepId)
    .order("sort_order");
  if (error) return errorResponse(503, "nodes_unavailable");
  const nodes = (rows ?? []).map((row) => {
    const meta = row.session_meta && typeof row.session_meta === "object" ? (row.session_meta as Record<string, unknown>) : null;
    return {
      id: row.id as string,
      kind: row.kind as string,
      status: row.status as string,
      sortOrder: Number(row.sort_order ?? 0),
      dayIndex: Number(row.day_index ?? 1),
      sessionMeta: meta,
    };
  });

  const refs: StudyNodeRef[] = nodes.map((node) => ({
    id: node.id,
    kind: node.kind,
    sortOrder: node.sortOrder,
    status: node.status,
    sessionMeta: {
      topicId: typeof node.sessionMeta?.topicId === "string" ? node.sessionMeta.topicId : null,
      topicTitle: typeof node.sessionMeta?.topicTitle === "string" ? node.sessionMeta.topicTitle : null,
    },
  }));
  // Konu iki kimliğinden biriyle gelebilir (konu satırı ya da belge konu düğümü): tek eşleştirici satırı bulur, düğüm
  // araması ve yeni düğümün metası iki kimliği de tanır (30 Ekim 2026, `topic-identity.ts`).
  const { data: topicRows } = await service
    .from("exam_prep_topics")
    .select("id, label, document_topic_node_id")
    .eq("exam_prep_id", prepId);
  const row = createTopicIndex(
    (topicRows ?? []).map((item) => ({
      id: String(item.id),
      label: String(item.label ?? "").trim(),
      documentTopicNodeId: typeof item.document_topic_node_id === "string" ? item.document_topic_node_id : null,
    })),
  ).rowFor({ id: topicId, label: topicLabel });
  const topic: StudyTopicRef & { label: string } = row
    ? { id: row.id, documentTopicNodeId: row.documentTopicNodeId ?? null, label: row.label || topicLabel }
    : { id: topicId, label: topicLabel };
  const pick = freeActivityPick(refs, prepId, topic, tool as StudyToolId);
  if (pick.ok && pick.kind === "node") {
    return NextResponse.json({ ok: true, nodeId: pick.nodeId, href: pick.href, created: false });
  }

  const kind = FREE_PICK_NODE_KINDS[tool]!.create;
  const plan = planActivityInsert(nodes, topic, kind);
  const { data: nodeId, error: insertError } = await service.rpc("exam_path_insert_after", {
    p_prep_id: prepId,
    p_after_sort: plan.afterSort,
    p_kind: kind,
    p_title: plan.title,
    p_day_index: plan.dayIndex,
    p_session_meta: plan.sessionMeta,
  });
  if (insertError || typeof nodeId !== "string") return errorResponse(503, "node_create_failed");
  await service.from("exam_prep_nodes").update({ status: "ready" }).eq("id", nodeId).eq("status", "locked");
  return NextResponse.json({ ok: true, nodeId, href: studyActivityHref(prepId, nodeId, null), created: true });
}
