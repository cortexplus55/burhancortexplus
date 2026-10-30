import type { SupabaseClient } from "@supabase/supabase-js";
import { prefetchVariant } from "@/lib/learning/lesson-prefetch";

/**
 * Hazırlığın podcast sayfası aynı konunun yoldaki hazır podcast'ini kullanır (30 Ekim 2026).
 *
 * Canlı tur: yoldaki podcast adımı önceden yazılmış ve hazır beklerken öğrenci aynı konuyu "Podcast oluştur"
 * sayfasından istedi; sayfa onu görmedi, 90 saniyede baştan yazdı (Astra'da 43 sn). Hazır içeriği teslim etme ve
 * ücretlendirme tek yerde, düğüm açılışında; burada ikinci bir kopyası yazılmaz. Sayfa öğrenciyi o adıma götürür.
 */
export type PathPodcastCandidate = {
  nodeId: string;
  kind: string;
  status: string;
  topicId: string | null;
};

export type PrefetchRow = { nodeId: string; status: string; variant: string | null };

/** Saf seçim: konunun bitmemiş podcast adımı ve aynı süreyle hazır bekleyen önceden yazımı. */
export function pickReadyPathPodcast(input: {
  topicIds: readonly string[];
  length: string;
  nodes: readonly PathPodcastCandidate[];
  prefetch: readonly PrefetchRow[];
}): string | null {
  const ids = new Set(input.topicIds.filter(Boolean));
  const wanted = prefetchVariant("podcast", { topicLabel: "", podcastLength: input.length });
  for (const node of input.nodes) {
    if (node.kind !== "podcast" || node.status === "done" || node.status === "hidden") continue;
    if (!node.topicId || !ids.has(node.topicId)) continue;
    const row = input.prefetch.find((item) => item.nodeId === node.nodeId);
    if (row && row.status === "ready" && (row.variant === null || row.variant === wanted)) return node.nodeId;
  }
  return null;
}

/** Okuma; hata ya da bulunamazsa null (sayfa her zamanki gibi yazar). */
export async function readyPathPodcastNode(
  service: SupabaseClient,
  input: { userId: string; prepId: string; topicIds: readonly string[]; length: string },
): Promise<string | null> {
  try {
    const { data: nodes } = await service
      .from("exam_prep_nodes")
      .select("id, kind, status, session_meta")
      .eq("exam_prep_id", input.prepId)
      .eq("kind", "podcast")
      .neq("status", "done");
    const candidates: PathPodcastCandidate[] = (nodes ?? []).map((row) => {
      const meta = row.session_meta && typeof row.session_meta === "object" ? (row.session_meta as Record<string, unknown>) : {};
      return {
        nodeId: String(row.id),
        kind: String(row.kind),
        status: String(row.status),
        topicId: typeof meta.topicId === "string" ? meta.topicId : null,
      };
    });
    if (!candidates.length) return null;
    const { data: rows } = await service
      .from("exam_prep_prefetch")
      .select("node_id, status, payload")
      .eq("user_id", input.userId)
      .in(
        "node_id",
        candidates.map((candidate) => candidate.nodeId),
      );
    const prefetch: PrefetchRow[] = (rows ?? []).map((row) => {
      const variant = (row.payload as { prefetchVariant?: unknown } | null)?.prefetchVariant;
      return { nodeId: String(row.node_id), status: String(row.status), variant: typeof variant === "string" ? variant : null };
    });
    return pickReadyPathPodcast({ topicIds: input.topicIds, length: input.length, nodes: candidates, prefetch });
  } catch {
    return null;
  }
}
