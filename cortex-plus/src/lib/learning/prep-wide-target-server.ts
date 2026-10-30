import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlanNodeKind } from "@/lib/learning/exam-prep-plan";
import { weakTopicsForPrep, type PrepTopicRow } from "@/lib/learning/exam-local-session";
import {
  findTopicRow,
  PREP_WIDE_TARGET_KINDS,
  prepWideTargetTopic,
  REQUESTED_TOPIC_KINDS,
} from "@/lib/learning/prep-wide-target";
import { createTopicIndex, nodeOnTopic, topicLabelsMatch } from "@/lib/learning/topic-identity";
import { parseTopicSourceRefs } from "@/lib/learning/topic-source-refs";

export type NodeTopicRetarget = {
  topic: PrepTopicRow;
  /** Düğümün session_meta.topicId biçimi: belgeli hazırlıkta belge konu düğümü, değilse konu satırı. */
  metaTopicId: string;
  topicDocumentId: string | null;
  topicNodeId: string | null;
  /** O konunun ders düğümlerinin sayfaları; yoksa konu kaydının kaynak sayfaları; boşsa kaynak konunun kaydından çözülür. */
  sourcePages: number[];
  reason: "requested" | "weakest";
};

/**
 * Konunun ders sayfaları. Düğüm konusu tek kuralla (`nodeOnTopic`, 30 Ekim 2026): kimlik iki tarafta da varsa kimlik
 * (konu satırı ya da belge konu düğümü), yoksa ad. Önceden kimlik tutmasa da ad eşleşmesi kabul ediliyordu.
 */
async function lessonPagesFor(
  service: SupabaseClient,
  prepId: string,
  topic: PrepTopicRow,
): Promise<number[]> {
  const { data } = await service
    .from("exam_prep_nodes")
    .select("session_meta")
    .eq("exam_prep_id", prepId)
    .eq("kind", "lesson");
  const pages = new Set<number>();
  const identity = { id: topic.id, documentTopicNodeId: topic.document_topic_node_id, label: topic.label };
  for (const row of data ?? []) {
    const meta =
      row.session_meta && typeof row.session_meta === "object"
        ? (row.session_meta as { topicId?: unknown; topicTitle?: unknown; sourcePages?: unknown })
        : null;
    if (!meta || !nodeOnTopic(meta, identity) || !Array.isArray(meta.sourcePages)) continue;
    for (const page of meta.sourcePages) {
      if (typeof page === "number" && page > 0) pages.add(page);
    }
  }
  return [...pages].sort((a, b) => a - b);
}

/** Konunun ders düğümü yoksa (öğrencinin seçtiği, yolda dersi olmayan konu) konu kaydının kendi kaynak sayfaları. */
function sourceRefPages(topic: PrepTopicRow, documentId: string | null): number[] {
  const refs = parseTopicSourceRefs(topic.source_refs);
  const ref = (documentId ? refs.find((item) => item.documentId === documentId) : null) ?? refs[0];
  return ref ? [...new Set(ref.pages)].filter((page) => Number.isInteger(page) && page > 0).sort((a, b) => a - b) : [];
}

/**
 * Düğümün konusu değişmeli mi (20 Ekim 2026)? İki durum: öğrenci başka bir konuyu seçti (`?konu=`, sözlüde konu
 * seçicinin kimliği) ya da hazırlık geneli düğüm (prep-wide-target.ts) zayıf konuya yönelir. Konu kaydı bulunamazsa
 * null: düğüm devraldığı konuyla açılır — istek düşmez.
 */
export async function retargetNodeTopic(
  service: SupabaseClient,
  input: {
    userId: string;
    prepId: string;
    kind: PlanNodeKind;
    requestedTopic: string;
    /** Seçilen konunun kimliği (konu satırı ya da belge konu düğümü); varsa ad yerine bu çözülür (30 Ekim 2026). */
    requestedTopicId?: string | null;
    adaptiveFocus: string | null;
    /** Yerel oturumun zayıf konu listesi; yoksa hafif okumayla bulunur. */
    practiceTopics: readonly string[] | undefined;
    inheritedTopicTitle: string | null;
    currentTopicId: string | null;
  },
): Promise<NodeTopicRetarget | null> {
  const requested = input.requestedTopic.trim();
  const requestedId = input.requestedTopicId?.trim() || null;
  let wanted: string | null = null;
  let reason: NodeTopicRetarget["reason"] = "weakest";
  let topics: PrepTopicRow[] | null = null;

  if (requestedId && REQUESTED_TOPIC_KINDS.has(input.kind)) {
    reason = "requested";
  } else if (requested) {
    if (!REQUESTED_TOPIC_KINDS.has(input.kind) || topicLabelsMatch(requested, input.inheritedTopicTitle)) return null;
    wanted = requested;
    reason = "requested";
  } else if (PREP_WIDE_TARGET_KINDS.has(input.kind) && !input.adaptiveFocus?.trim()) {
    const loaded = await weakTopicsForPrep(service, { userId: input.userId, prepId: input.prepId });
    topics = loaded.topics;
    wanted = prepWideTargetTopic({
      kind: input.kind,
      requestedTopic: "",
      adaptiveFocus: input.adaptiveFocus,
      practiceTopics: input.practiceTopics?.length ? input.practiceTopics : loaded.weakTopics,
      mastery: loaded.mastery,
      plannedTopics: loaded.topics.map((row) => row.label),
    });
    if (!wanted || topicLabelsMatch(wanted, input.inheritedTopicTitle)) return null;
  }
  if (!wanted && !(requestedId && reason === "requested")) return null;

  if (!topics) {
    const { data } = await service
      .from("exam_prep_topics")
      .select("id, label, document_topic_node_id, source_refs, measured_level")
      .eq("exam_prep_id", input.prepId)
      .order("sort_order");
    topics = (data ?? [])
      .map((row) => ({
        id: String(row.id),
        label: String(row.label ?? "").trim(),
        document_topic_node_id: typeof row.document_topic_node_id === "string" ? row.document_topic_node_id : null,
        source_refs: row.source_refs ?? null,
        measured_level: typeof row.measured_level === "string" ? row.measured_level : null,
      }))
      .filter((row) => row.label);
  }
  // Kimlik önce (tek eşleştirici), sonra ad.
  const byId = requestedId
    ? createTopicIndex(topics.map((row) => ({ ...row, documentTopicNodeId: row.document_topic_node_id }))).rowFor({
        id: requestedId,
      })
    : null;
  const topic = byId ?? (wanted ? findTopicRow(topics, wanted) : null);
  if (!topic || topic.id === input.currentTopicId) return null;

  let topicDocumentId: string | null = null;
  if (topic.document_topic_node_id) {
    const { data: topicNode } = await service
      .from("document_topic_nodes")
      .select("document_id")
      .eq("id", topic.document_topic_node_id)
      .maybeSingle();
    if (typeof topicNode?.document_id === "string") topicDocumentId = topicNode.document_id;
  }

  const lessonPages = await lessonPagesFor(service, input.prepId, topic);
  return {
    topic: {
      id: topic.id,
      label: topic.label,
      document_topic_node_id: topic.document_topic_node_id,
      source_refs: topic.source_refs,
      measured_level: topic.measured_level,
    },
    metaTopicId: topic.document_topic_node_id ?? topic.id,
    topicDocumentId,
    topicNodeId: topic.document_topic_node_id,
    // Sözlü sayfa çözücüsünden geçmez: ders sayfası yoksa konunun kaynak sayfaları, yoksa kaynak hazırlık adıyla
    // aranıyor ve sorular başka konulardan geliyordu. Öbür türler sayfasızsa ders çözücüsüne gider (değişmedi).
    sourcePages: lessonPages.length ? lessonPages : input.kind === "oral" ? sourceRefPages(topic, topicDocumentId) : [],
    reason,
  };
}
