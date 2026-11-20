/**
 * Faz 2 (madde 7.4): hazırlık kurulumunun aşamalı yazımı — saf parçalar (sunucu bağımlılığı yok, birim testli).
 *
 * İlk ekran (yol haritası + 1. ünitenin adımları) istek içinde yazılır; geri kalan düğüm `session_meta`'sı ve konu
 * alanları arka plana kalır. 1. ünite: sırada `topicId` taşıyan ilk düğümün konusu; o konunun kesintisiz koşusunun
 * son düğümüne kadar bütün adımlar (öncesindeki konusuz giriş adımları dahil).
 */
import type { PlanNodeSessionMeta } from "@/lib/learning/exam-prep-plan";
import type { TopicContradiction } from "@/lib/learning/source-contradictions";
import type { TopicSourceRef } from "@/lib/learning/topic-merge";

export type SetupNodeWrite = { sort_order: number; meta: PlanNodeSessionMeta };

/** Yalnız gönderilen alan yazılır (`apply_exam_prep_setup`). */
export type SetupTopicWrite = {
  id: string;
  document_topic_node_id?: string | null;
  familiarity?: string | null;
  measured_level?: string;
  diagnostic_status?: string;
  source_refs?: TopicSourceRef[];
  contradictions?: TopicContradiction[];
  /** Ana ünitenin alt başlıkları (Faz 10; göç 20261121120000 sütunu ve RPC alanını ekler). */
  subtopics?: string[];
};

export type ContradictionInput = {
  documentIds: string[];
  topics: { title: string; sources: { documentId: string; pages: number[] }[] }[];
};

/** `exam_preps.setup_finish`: arka plana kalan iş. */
export type PrepSetupFinish = {
  v: 1;
  /** Son sahiplenme anı; bayatlarsa (iş yarıda öldü) yeniden sahiplenilir. */
  startedAt: string;
  nodes: SetupNodeWrite[];
  topics: SetupTopicWrite[];
  contradictions: ContradictionInput | null;
  masterPlan: boolean;
};

/** Arka plan işi bu kadar süre ilerleme yazmadıysa ölmüş sayılır (fonksiyon tavanı 300 sn değil; iş kısa). */
export const SETUP_FINISH_STALE_MS = 90_000;

/** 1. ünitenin son adımının sırası (dahil). Konulu düğüm yoksa (eski şablon) bütün düğümler ilk ekrandır. */
export function firstUnitCutoff(nodes: readonly SetupNodeWrite[]): number {
  const sorted = [...nodes].sort((a, b) => a.sort_order - b.sort_order);
  const firstIndex = sorted.findIndex((node) => typeof node.meta.topicId === "string" && node.meta.topicId);
  if (firstIndex < 0) return Number.POSITIVE_INFINITY;
  const topicId = sorted[firstIndex]!.meta.topicId;
  let cutoff = sorted[firstIndex]!.sort_order;
  for (let index = firstIndex + 1; index < sorted.length; index += 1) {
    const node = sorted[index]!;
    const other = node.meta.topicId;
    if (other && other !== topicId) break;
    if (other === topicId) cutoff = node.sort_order;
  }
  return cutoff;
}

/**
 * İlk ekranın yazımı ve arka plana kalan yazım. İlk ekran konuları: 1. ünite düğümlerinin konuları; konulu düğüm
 * yoksa ilk konu (hazırlık sayfası etkin konu yoksa ilk konuyu açar).
 */
export function splitSetupWrites(
  nodes: readonly SetupNodeWrite[],
  topics: readonly SetupTopicWrite[],
): { now: { nodes: SetupNodeWrite[]; topics: SetupTopicWrite[] }; later: { nodes: SetupNodeWrite[]; topics: SetupTopicWrite[] } } {
  const cutoff = firstUnitCutoff(nodes);
  const nowNodes = nodes.filter((node) => node.sort_order <= cutoff);
  const laterNodes = nodes.filter((node) => node.sort_order > cutoff);
  const firstTopicIds = new Set(nowNodes.map((node) => node.meta.topicId).filter((id): id is string => Boolean(id)));
  if (!firstTopicIds.size && topics[0]) firstTopicIds.add(topics[0].id);
  return {
    now: { nodes: nowNodes, topics: topics.filter((topic) => firstTopicIds.has(topic.id)) },
    later: { nodes: laterNodes, topics: topics.filter((topic) => !firstTopicIds.has(topic.id)) },
  };
}

/** Kayıttan okunan alanı doğrular; bozuksa null (iş yeniden kurulamaz, sayfa yine açılır). */
export function parseSetupFinish(raw: unknown): PrepSetupFinish | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<PrepSetupFinish>;
  if (value.v !== 1 || typeof value.startedAt !== "string") return null;
  if (!Array.isArray(value.nodes) || !Array.isArray(value.topics)) return null;
  const nodes = value.nodes.filter(
    (node): node is SetupNodeWrite =>
      Boolean(node) && Number.isInteger(node.sort_order) && Boolean(node.meta) && typeof node.meta === "object",
  );
  const topics = value.topics.filter((topic): topic is SetupTopicWrite => Boolean(topic) && typeof topic.id === "string");
  const contradictions =
    value.contradictions && Array.isArray(value.contradictions.documentIds) && Array.isArray(value.contradictions.topics)
      ? value.contradictions
      : null;
  return { v: 1, startedAt: value.startedAt, nodes, topics, contradictions, masterPlan: value.masterPlan === true };
}

/** Sahiplenme zamanı bayat mı (arka plan işi yarıda kesildi). */
export function setupFinishIsStale(finish: Pick<PrepSetupFinish, "startedAt">, now = Date.now()): boolean {
  const started = Date.parse(finish.startedAt);
  return !Number.isFinite(started) || now - started >= SETUP_FINISH_STALE_MS;
}

/** Çelişki sonucu konu yazımına (her konu: kendi başlığının çelişkileri, yoksa boş liste — eski davranış). */
export function withContradictions(
  topics: readonly { id: string; label: string }[],
  byTitle: ReadonlyMap<string, TopicContradiction[]>,
): SetupTopicWrite[] {
  return topics.map((topic) => ({ id: topic.id, contradictions: byTitle.get(String(topic.label)) ?? [] }));
}

/** Aynı konuya giden iki yazımı birleştirir (sonraki alan öncekini ezer). */
export function mergeTopicWrites(...lists: readonly SetupTopicWrite[][]): SetupTopicWrite[] {
  const byId = new Map<string, SetupTopicWrite>();
  for (const list of lists) {
    for (const write of list) byId.set(write.id, { ...(byId.get(write.id) ?? {}), ...write });
  }
  return [...byId.values()];
}
