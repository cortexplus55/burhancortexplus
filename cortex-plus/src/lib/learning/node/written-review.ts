/** Yazılı denemenin sonucu ve açıklama tamamlaması (kayıtlı inceleme, kaynak sayfası denetimi). */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateJson, isPremiumUser } from "@/lib/ai/generate";
import { loadPageSourceContext } from "@/lib/learning/source-context";
import { parseSessionMeta } from "@/lib/learning/teaching-standards";
import { acceptFilledExplanations, buildWrittenExamReview, explanationFillAttempted, explanationFillPrompt, groundWrittenReview, missingExplanationIndexes, questionsFromQuizPayload, readExplanationCache, readStoredReview, withCachedExplanations } from "@/lib/learning/written-exam-review";

export async function knownTopicLabels(service: SupabaseClient, prepId: string) {
  const { data } = await service
    .from("exam_prep_topics")
    .select("label")
    .eq("exam_prep_id", prepId);
  return (data ?? []).map((row) => String(row.label ?? "").trim()).filter(Boolean);
}

/** Deneme sonucu için kaynak sayfaları. Okunamazsa tanım denetimi boş kaynakla sürer. */
export async function reviewSourceBlock(
  service: SupabaseClient,
  userId: string,
  prepId: string,
  nodeId: string,
): Promise<string> {
  try {
    const { data: node } = await service
      .from("exam_prep_nodes")
      .select("session_meta")
      .eq("id", nodeId)
      .eq("exam_prep_id", prepId)
      .maybeSingle();
    const pages = parseSessionMeta(node?.session_meta)?.sourcePages;
    const { data: prep } = await service
      .from("exam_preps")
      .select("document_id")
      .eq("id", prepId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!prep?.document_id || !pages?.length) return "";
    const source = await loadPageSourceContext(service, userId, prep.document_id as string, pages);
    return source.block;
  } catch {
    return "";
  }
}

/**
 * Yazılı deneme sonucu. Açıklama yoksa en fazla bir çağrı; bayrak denemeye yazılır,
 * aynı deneme yeniden açılınca model bir daha çalışmaz.
 */
export async function writtenReviewForPayload(
  service: SupabaseClient,
  input: {
    userId: string;
    prepId: string;
    attemptId: string;
    nodeId: string;
    payload: unknown;
    answers: Record<string, unknown>;
    topicLabel: string;
    allowFill: boolean;
  },
) {
  const source = await reviewSourceBlock(service, input.userId, input.prepId, input.nodeId);
  const stored = readStoredReview(input.payload);
  if (stored) return groundWrittenReview(stored, source);
  const questions = questionsFromQuizPayload(input.payload);
  if (!questions.length) return null;
  let cache = readExplanationCache(input.payload);
  let working = withCachedExplanations(questions, cache);
  const missing = missingExplanationIndexes(working);
  if (input.allowFill && missing.length && !explanationFillAttempted(input.payload)) {
    const base =
      input.payload && typeof input.payload === "object"
        ? (input.payload as Record<string, unknown>)
        : {};
    await service
      .from("exam_prep_node_attempts")
      .update({ payload: { ...base, explanationFillAttempted: true } })
      .eq("id", input.attemptId);
    const outcome = await generateJson({
      service,
      userId: input.userId,
      actionCode: "AI_CHAT_STANDARD",
      freeMeter: "included",
      isPremium: await isPremiumUser(service, input.userId),
      schemaHint: 'JSON: {"explanations":[{"index":number,"text":string}]}',
      userPrompt: explanationFillPrompt(working, missing),
      parse: (raw) => raw,
    });
    if (outcome.ok) {
      cache = { ...cache, ...acceptFilledExplanations(working, outcome.data, source) };
      working = withCachedExplanations(questions, cache);
    }
  } else if (!input.allowFill) {
    const knownTopics = await knownTopicLabels(service, input.prepId);
    return buildWrittenExamReview(working, input.answers, {
      fallbackTopic: input.topicLabel,
      knownTopics,
      source,
    });
  }
  const knownTopics = await knownTopicLabels(service, input.prepId);
  const review = buildWrittenExamReview(working, input.answers, {
    fallbackTopic: input.topicLabel,
    knownTopics,
    source,
  });
  const base =
    input.payload && typeof input.payload === "object"
      ? (input.payload as Record<string, unknown>)
      : {};
  await service
    .from("exam_prep_node_attempts")
    .update({
      payload: {
        ...base,
        explanationCache: cache,
        explanationFillAttempted: true,
        writtenReview: review,
      },
    })
    .eq("id", input.attemptId);
  return review;
}
