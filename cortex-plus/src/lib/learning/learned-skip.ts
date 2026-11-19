/**
 * Faz 4 madde 3.4 "Uyarlamalı Hedefli Tekrar": konusu "Öğrendin" olan tekrar adımı 0 kredi ile atlanır. Karar tek
 * yerde: düğüm türü tekrar adımı, adım bitmemiş ve konunun rozeti (Akıllı Kavrama politikası) "Öğrendin". Atlama
 * kredi ayırmaz, model çağırmaz, kavrama kanıtı yazmaz; yalnız yol bir adım ilerler.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { masteryByPlannedTopic, targetedReviewTopics, topicBadge, type TopicMasterySnapshot } from "@/lib/learning/learning-tracking";
import { weakTopicsForPrep } from "@/lib/learning/exam-local-session";
import { createTopicIndex } from "@/lib/learning/topic-identity";
import { LEARNED_SKIP_KINDS } from "@/lib/learning/learned-skip-copy";

export { LEARNED_SKIP_COPY, LEARNED_SKIP_KINDS } from "@/lib/learning/learned-skip-copy";

/** Saf karar: tür tekrar adımı, adım bitmemiş, rozet "Öğrendin". */
export function canSkipLearnedStep(input: { kind: string; status: string; badge: string | null }): boolean {
  return LEARNED_SKIP_KINDS.has(input.kind) && input.status !== "done" && input.badge === "learned";
}

/** Planlı konular ve hâkimiyet satırlarından düğüm konusunun rozeti (ekranlarla aynı birleştirici). */
export function plannedTopicBadge(input: {
  topicLabel: string;
  plannedLabels: readonly string[];
  mastery: readonly TopicMasterySnapshot[];
  targetScore: number | null;
}): string | null {
  const labels = input.plannedLabels.filter((label) => label.trim());
  const row = createTopicIndex(labels.map((label) => ({ id: label, label }))).rowForKey(input.topicLabel);
  if (!row) return null;
  const snapshot = masteryByPlannedTopic(labels, input.mastery).get(row.label);
  return snapshot ? topicBadge(snapshot, input.targetScore) : null;
}

/** Düğüm konusunun tekrar durumu: "Öğrendin" (atlama açık) ya da hedefli tekrar konusu (önce ücretsiz tekrar). */
export type NodeTopicReviewState = { learned: boolean; targeted: boolean };

export function nodeTopicReviewState(input: {
  topicLabel: string;
  plannedLabels: readonly string[];
  mastery: readonly TopicMasterySnapshot[];
  targetScore: number | null;
}): NodeTopicReviewState {
  const labels = input.plannedLabels.filter((label) => label.trim());
  const row = createTopicIndex(labels.map((label) => ({ id: label, label }))).rowForKey(input.topicLabel);
  if (!row) return { learned: false, targeted: false };
  return {
    learned: plannedTopicBadge(input) === "learned",
    targeted: targetedReviewTopics(labels, input.mastery, input.targetScore).includes(row.label),
  };
}

/** Sunucu okuması: düğüm konusunun tekrar durumu. Okuma düşerse ikisi de kapalı (atlama açılmaz). */
export async function topicReviewStateForNode(
  service: SupabaseClient,
  input: { userId: string; prepId: string; topicLabel: string; targetScore: number | null },
): Promise<NodeTopicReviewState> {
  try {
    const { topics, mastery } = await weakTopicsForPrep(service, { userId: input.userId, prepId: input.prepId });
    return nodeTopicReviewState({
      topicLabel: input.topicLabel,
      plannedLabels: topics.map((row) => row.label),
      mastery,
      targetScore: input.targetScore,
    });
  } catch (error) {
    console.error("learned_skip_read_failed", { prepId: input.prepId, message: error instanceof Error ? error.message : String(error) });
    return { learned: false, targeted: false };
  }
}

/** Sunucu okuması: düğüm konusu bu hazırlıkta "Öğrendin" mi. Okuma düşerse hayır. */
export async function learnedTopicForNode(
  service: SupabaseClient,
  input: { userId: string; prepId: string; topicLabel: string; targetScore: number | null },
): Promise<boolean> {
  return (await topicReviewStateForNode(service, input)).learned;
}
