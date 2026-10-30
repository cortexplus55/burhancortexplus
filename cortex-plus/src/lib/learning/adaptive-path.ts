import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  extraPracticeToSkip,
  hasPendingAdaptivePractice,
  pathDecision,
  type PathChange,
  type PathNodeRow,
} from "@/lib/learning/path-change";

/**
 * Sonuca göre yol (20 Ekim 2026, ürün sahibinin kararı: kendiliğinden). Tamamlama RPC'sinden ÖNCE
 * çağrılır: araya giren odaklı pratik, RPC'nin "sıradakini aç" adımıyla kendiliğinden açılır.
 *
 * - %50 altı → konunun odaklı pratiği bu adımın hemen arkasına (`exam_path_insert_after`). İçerik
 *   açılınca kayıtlardan kurulur (yanlış sorular, ders soruları); yeni model çağrısı yalnız kayıt yoksa.
 * - %90 ve üstü → konunun kalan ek testleri yoldan çıkar (denemesi olmayanlar; her konunun bir testi kalır).
 *
 * Yol değişikliği tamamlamaya ektir: hata olursa sessizce `null`, adım yine biter.
 */
export async function adaptPathAfterResult(
  service: SupabaseClient,
  input: {
    prepId: string;
    node: { id: string; kind: string; sortOrder: number; dayIndex: number; sessionMeta: Record<string, unknown> | null };
    topicLabel: string;
    score: number;
    total: number;
    /**
     * İçerik düğümün konusu dışında bir konuyu sorduysa (sözlü konu seçici, `?konu=`; 30 Ekim 2026) yol o konuya göre
     * değişir. Kimlik düğüm metası biçiminde (belgeli hazırlıkta belge konu düğümü). Canlı tur: "Enflasyon Türleri"
     * sözlüsünün düşük sonucu "Para Politikası"na odaklı pratik ekledi.
     */
    testedTopic?: { topicId: string | null; topicTitle: string } | null;
  },
): Promise<PathChange | null> {
  const decision = pathDecision({ kind: input.node.kind, score: input.score, total: input.total });
  if (!decision) return null;
  const nodeMeta = input.node.sessionMeta ?? {};
  const tested = input.testedTopic?.topicTitle?.trim() ? input.testedTopic : null;
  // Sorulan konu başkaysa düğümün sayfası, hedefi ve ünitesi yeni adıma taşınmaz (o konunun değil).
  const meta: Record<string, unknown> = tested
    ? (() => {
        const { sourcePages: _pages, objective: _objective, unitTitle: _unit, topicId: _id, ...rest } = nodeMeta;
        void _pages;
        void _objective;
        void _unit;
        void _id;
        return { ...rest, ...(tested.topicId ? { topicId: tested.topicId } : {}), topicTitle: tested.topicTitle.trim() };
      })()
    : nodeMeta;
  const topicTitle = tested
    ? tested.topicTitle.trim()
    : (typeof meta.topicTitle === "string" && meta.topicTitle.trim()) || input.topicLabel.trim();
  if (!topicTitle) return null;
  const topic = { topicId: typeof meta.topicId === "string" ? meta.topicId : null, topicTitle };

  const { data, error } = await service
    .from("exam_prep_nodes")
    .select("id, kind, status, sort_order, session_meta")
    .eq("exam_prep_id", input.prepId)
    .order("sort_order");
  if (error || !data) return null;
  const nodes: PathNodeRow[] = data.map((row) => ({
    id: row.id as string,
    kind: row.kind as string,
    status: row.status as string,
    sortOrder: (row.sort_order as number) ?? 0,
    sessionMeta: row.session_meta && typeof row.session_meta === "object" ? (row.session_meta as Record<string, unknown>) : null,
  }));

  if (decision === "low") {
    if (hasPendingAdaptivePractice(nodes, topic)) return null;
    const { error: insertError } = await service.rpc("exam_path_insert_after", {
      p_prep_id: input.prepId,
      p_after_sort: input.node.sortOrder,
      p_kind: "focused",
      p_title: `Odaklı pratik · ${topicTitle}`,
      p_day_index: input.node.dayIndex,
      p_session_meta: {
        ...meta,
        topicTitle,
        role: "practice",
        objective: `${topicTitle} konusunda yanlış yapılan noktaları pekiştir`,
        adaptive: "low",
        adaptiveFrom: input.node.id,
      },
    });
    return insertError ? null : { kind: "added", topic: topicTitle };
  }

  const candidates = nodes.filter((node) => node.kind === "quiz" && node.status !== "done" && node.sortOrder > input.node.sortOrder);
  if (!candidates.length) return null;
  const { data: attempts } = await service
    .from("exam_prep_node_attempts")
    .select("node_id")
    .in("node_id", candidates.map((node) => node.id));
  const attempted = new Set((attempts ?? []).map((row) => row.node_id as string));
  const skip = extraPracticeToSkip(nodes, input.node, topic, attempted);
  if (!skip.length) return null;
  const { error: deleteError } = await service
    .from("exam_prep_nodes")
    .delete()
    .eq("exam_prep_id", input.prepId)
    .neq("status", "done")
    .in("id", skip);
  return deleteError ? null : { kind: "skipped", topic: topicTitle, count: skip.length };
}
