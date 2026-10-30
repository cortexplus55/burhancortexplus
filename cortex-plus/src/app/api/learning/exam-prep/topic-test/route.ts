/**
 * Konunun testi nerede? Salt okur (30 Ekim 2026, Astra ile yan yana tur).
 *
 * Ders sonundaki "Kendini test et · Bu dersi hızlı bir bilgi kontrolüyle tamamla · Sınavla bitir" kartı Eylül'den beri
 * bütün hazırlığın yazılı deneme kurulumuna gidiyordu; Astra'da aynı kart o dersin testini açıyor. Bu uç yolda dersin
 * konusunun ilk bitmemiş konu testini bulur (konu kimliğinin iki biçimi de: `resolvePrepTopicRow`); yoksa `href: null`
 * ve düğme bugünkü gibi yazılı denemeye gider. Model çağırmaz, ücret yazmaz.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { nodeForTopic, type TopicNodeLike } from "@/lib/learning/exam-prep-ui-path";
import { examPrepNodeHref } from "@/lib/learning/exam-prep-hrefs";
import { resolvePrepTopicRow } from "@/lib/learning/prep-topic-lookup";

const querySchema = z.object({
  prepId: z.string().uuid(),
  topicId: z.string().min(1).max(64),
});

const NO_STORE = { "Cache-Control": "no-store" } as const;

export async function GET(request: Request) {
  const guard = await withUser(request, { scope: "exam-topic-test", limit: 60 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return errorResponse(400, "invalid_input");
  const { prepId, topicId } = parsed.data;

  const { data: prep } = await service.from("exam_preps").select("id").eq("id", prepId).eq("user_id", userId).maybeSingle();
  if (!prep) return errorResponse(404, "not_found");

  const topic = await resolvePrepTopicRow<{ id: string; label: string | null; document_topic_node_id: string | null }>(
    service,
    prepId,
    topicId,
    "id, label, document_topic_node_id",
  );
  const { data: rows } = await service
    .from("exam_prep_nodes")
    .select("id, sort_order, status, session_meta")
    .eq("exam_prep_id", prepId)
    .eq("kind", "quiz");
  const nodes: TopicNodeLike[] = (rows ?? []).map((row) => ({
    id: row.id as string,
    sortOrder: (row.sort_order as number | null) ?? 0,
    status: row.status as TopicNodeLike["status"],
    sessionMeta: row.session_meta as TopicNodeLike["sessionMeta"],
  }));
  const node = nodeForTopic(nodes, {
    ids: [topicId, topic?.id, topic?.document_topic_node_id],
    label: topic?.label ?? null,
  });
  return NextResponse.json({ href: node ? examPrepNodeHref(prepId, node.id) : null }, { headers: NO_STORE });
}
