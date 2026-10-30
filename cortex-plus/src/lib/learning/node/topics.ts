/** İçeriğin sorduğu konunun satırı (tek eşleştirici, `topic-identity.ts`). */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { contentTestedTopic, createTopicIndex, nodeOnTopic, type TopicMetaLike } from "@/lib/learning/topic-identity";

export type PrepTopicIdentityRow = { id: string; label: string; documentTopicNodeId: string | null };

/** Hazırlığın konuları tek eşleştiriciyle (`createTopicIndex`); okuma düşerse boş dizin (eşleşme ada düşer). */
export async function loadPrepTopicIndex(service: SupabaseClient, prepId: string) {
  let data: unknown[] | null = null;
  try {
    const result = await service.from("exam_prep_topics").select("id, label, document_topic_node_id").eq("exam_prep_id", prepId);
    data = Array.isArray(result?.data) ? result.data : null;
  } catch {
    data = null;
  }
  return createTopicIndex<PrepTopicIdentityRow>(
    ((data ?? []) as { id: unknown; label: unknown; document_topic_node_id?: unknown }[])
      .map((row) => ({
        id: String(row.id),
        label: String(row.label ?? "").trim(),
        documentTopicNodeId: typeof row.document_topic_node_id === "string" ? row.document_topic_node_id : null,
      }))
      .filter((row) => row.label),
  );
}

/**
 * İçeriğin sorduğu konunun satırı (30 Ekim 2026): damga (`testedTopic`) varsa onun satırı, yoksa düğümün konusu.
 * Damga hiçbir satıra eşleşmezse null — çağıran damganın kendisini yazar (eski davranış).
 */
export function testedTopicRow(
  index: ReturnType<typeof createTopicIndex<PrepTopicIdentityRow>>,
  payload: unknown,
  current: { id?: unknown; label?: unknown; document_topic_node_id?: unknown } | null,
): PrepTopicIdentityRow | null {
  const label = contentTestedTopic(payload);
  if (label) return index.rowFor(label);
  if (!current || typeof current.id !== "string") return null;
  return (
    index.rowFor({ id: current.id }) ?? {
      id: current.id,
      label: typeof current.label === "string" ? current.label : "",
      documentTopicNodeId: typeof current.document_topic_node_id === "string" ? current.document_topic_node_id : null,
    }
  );
}

export function sameTopicAsNode(meta: unknown, row: PrepTopicIdentityRow): boolean {
  return nodeOnTopic(meta as TopicMetaLike, { id: row.id, documentTopicNodeId: row.documentTopicNodeId, label: row.label });
}
