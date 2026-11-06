/**
 * Kazanım dersi açılışı (Paket 3b, 3 Kasım 2026). Konu tek bir resmî kazanıma denk geliyorsa:
 *  - havuzda doğrulanmış kazanım dersi varsa model çağrısı yok, 0 kredi (lesson_timings path 'pool', meta.route 'outcome');
 *  - yoksa ortak havuz tavanı ve kazanım kilidiyle stream-first üretim: ilk bölüm yanıtla döner, kalanı `after` içinde
 *    yazılır ve kapıdan geçerse havuza kalıcı yazılır (path 'stream_first', meta.route 'outcome').
 * Tavan doluysa, kilit başkasındaysa, model yoksa ya da migration uygulanmadıysa null: bugünkü akış aynen çalışır.
 * Ücretsiz hesapta konu kilidi bundan önce (`freeTopicGate`) uygulanır; bu yol kilidi aşmaz.
 */
import "server-only";
import { after, NextResponse } from "next/server";
import { recordLessonTiming } from "@/lib/admin/beta-metrics";
import { env } from "@/lib/env";
import { poolBudgetAllows } from "@/lib/content-pool/fill-server";
import { openaiLlm, SHARED_VERIFY_MODEL } from "@/lib/content-pool/generate";
import { firstLessonBody, generateOutcomeLesson, OUTCOME_LESSON_ESTIMATE_USD, outcomeBlueprintKind, type OutcomeFirst } from "@/lib/content-pool/outcome-lesson";
import { claimOutcomeLesson, readOutcomeLesson, retireOutcomeLesson, verifyOutcomeLesson } from "@/lib/content-pool/outcome-store";
import { poolLessonV3, poolSliceForTopic } from "@/lib/content-pool/serve";
import { supabasePoolStore } from "@/lib/content-pool/supabase-store";
import type { PoolUnit } from "@/lib/content-pool/keys";
import type { LessonBody } from "@/lib/content-pool/schema";
import { buildingPayload } from "@/lib/learning/lesson-build";
import { prepLanguage } from "@/lib/learning/teacher-brain";
import { attemptStartResponse, upsertGenerationJob } from "@/lib/learning/attempt-lifecycle-persist";
import { awaitLoggedWrite, countTotal, onNodeFailure, readWalletBalance } from "@/lib/learning/node/shared";
import { publicPayloadForUser } from "@/lib/learning/node/payload";
import { saveTopicLesson } from "@/lib/learning/node/lesson-store";
import type { NodeContext } from "./context";
import type { StartLocals } from "./start-types";

type State = Pick<StartLocals, "topic" | "topicLabel" | "title" | "clientRequestId" | "voiceSession">;

/** Konu tek kazanıma denk geliyorsa o kazanım; değilse null (çok kazanımlı konu ünite dilimiyle açılır). */
export function singleOutcome(prefs: unknown, topicLabel: string | null | undefined): { unit: PoolUnit; code: string; outcomeId: string } | null {
  const slice = poolSliceForTopic(prefs, topicLabel);
  if (!slice?.codes || slice.codes.size !== 1 || slice.units.length !== 1) return null;
  const code = [...slice.codes][0]!;
  const unit = slice.units[0]!;
  const outcome = unit.outcomes.find((o) => o.code === code);
  return outcome ? { unit, code, outcomeId: outcome.outcomeId } : null;
}

function lessonPayload(body: LessonBody, title: string, target: { unit: PoolUnit; code: string; outcomeId: string }) {
  const lesson = poolLessonV3(body, title, target.unit.program.kind, outcomeBlueprintKind(target.unit.program.kind));
  return {
    type: "lesson",
    lesson,
    title: lesson.title,
    qualityReport: null,
    pool: { unitId: target.unit.unitId, programId: target.unit.program.id, outcomeCodes: [target.code], outcomeId: target.outcomeId, route: "outcome" },
    engine: "pool",
    refunded: false,
  } as Record<string, unknown>;
}

export async function serveOutcomeLesson(context: NodeContext, state: State): Promise<NextResponse | null> {
  const { userId, service, requestStarted, prefetch, teachingV2, prep, kind } = context;
  if (kind !== "lesson" || !teachingV2 || state.voiceSession || prefetch) return null;
  const target = singleOutcome(prep.learning_preferences, state.topicLabel);
  if (!target) return null;
  const stored = await readOutcomeLesson(service, target.unit, target.outcomeId).catch(() => null);
  if (stored) {
    const response = await openAttempt(context, state, lessonPayload(stored, state.title, target));
    if (response) {
      const ms = Date.now() - requestStarted;
      after(() => recordLessonTiming(service, { userId, kind, path: "pool", openMs: ms, meta: { route: "outcome", outcomeId: target.outcomeId, unitId: target.unit.unitId } }));
    }
    return response;
  }
  const llm = openaiLlm();
  if (!llm) return null;
  // Ortak havuz tavanı (SHARED_CONTENT + REINFORCE + OUTCOME_LESSON tek toplam): doluysa yeni havuz üretimi yok.
  if (!(await poolBudgetAllows(service, OUTCOME_LESSON_ESTIMATE_USD).catch(() => false))) return null;
  const claim = await claimOutcomeLesson(service, target.unit, target.outcomeId).catch(() => null);
  // Kilit başkasında (aynı anda açan öğrenci) ya da migration yok: çift üretim yerine bugünkü akış.
  if (!claim?.claimed) return null;
  const store = supabasePoolStore(service);
  const models = { generate: env.OPENAI_CONTENT_MODEL, verify: SHARED_VERIFY_MODEL };
  let announce: (first: OutcomeFirst | null) => void = () => undefined;
  const firstReady = new Promise<OutcomeFirst | null>((resolve) => (announce = resolve));
  const run = generateOutcomeLesson(target.unit, target.code, llm, {
    models,
    onUsage: (entry) => store.recordUsage(userId, [entry]).catch(onNodeFailure("node_usage_record_failed", { site: "outcome_lesson" })),
    onFirst: async (first) => announce(first),
  }).catch(() => null);
  void run.then((r) => {
    if (!r) announce(null);
  });
  const first = await Promise.race([firstReady, run.then(() => null)]);
  if (!first) {
    await retireOutcomeLesson(service, claim.id, { issues: ["ilk bölüm üretilemedi"] }).catch(onNodeFailure("node_outcome_retire_failed", { claimId: claim.id }));
    return null;
  }
  const firstScreenMs = Date.now() - requestStarted;
  const plan = first.plan.slice(1);
  const building = buildingPayload({ ...lessonPayload(firstLessonBody(first), state.title, target), upcoming: plan, plannedScreens: first.plan.length });
  const response = await openAttempt(context, state, building, async (attemptId, generationId) => {
    const result = await run;
    if (result?.ok) {
      await verifyOutcomeLesson(service, claim.id, result.lesson, result.qa, models.generate).catch(
        onNodeFailure("node_outcome_verify_failed", { claimId: claim.id }, false),
      );
    } else {
      await retireOutcomeLesson(service, claim.id, result?.qa ?? { issues: ["üretim düştü"] }).catch(onNodeFailure("node_outcome_retire_failed", { claimId: claim.id }));
    }
    // Kapıdan geçmeyen ders havuza girmez ama öğrenci okuduğunu kaybetmez (en az ilk bölüm).
    const body = result?.lesson ?? firstLessonBody(first);
    const final = { ...lessonPayload(body, state.title, target), ...(result?.ok ? {} : { pooled: false }) };
    await service.from("exam_prep_node_attempts").update({ payload: final, total: countTotal(kind, final) }).eq("id", attemptId).eq("generation_id", generationId);
  });
  if (!response) {
    after(async () => {
      const result = await run;
      if (result?.ok) await verifyOutcomeLesson(service, claim.id, result.lesson, result.qa, models.generate).catch(
        onNodeFailure("node_outcome_verify_failed", { claimId: claim.id }, false),
      );
      else await retireOutcomeLesson(service, claim.id, result?.qa ?? { issues: ["kayıt açılamadı"] }).catch(onNodeFailure("node_outcome_retire_failed", { claimId: claim.id }));
    });
    return null;
  }
  const ms = Date.now() - requestStarted;
  after(() => recordLessonTiming(service, { userId, kind, path: "stream_first", openMs: ms, firstScreenMs, meta: { route: "outcome", outcomeId: target.outcomeId, unitId: target.unit.unitId } }));
  return response;
}

/** Deneme kaydı açar (havuz açılışıyla aynı alanlar); `finish` verilirse yanıttan sonra `after` içinde çalışır. */
async function openAttempt(
  context: NodeContext,
  state: State,
  payload: Record<string, unknown>,
  finish?: (attemptId: string, generationId: string) => Promise<void>,
): Promise<NextResponse | null> {
  const { userId, service, prepId, nodeId, lessonFormat, prep, node, kind, difficulty, familiarity, mood, lessonReviewCards } = context;
  const { topic, topicLabel, title, clientRequestId } = state;
  const requestId = clientRequestId ?? crypto.randomUUID();
  const { data: row, error } = await service
    .from("exam_prep_node_attempts")
    .insert({
      node_id: nodeId,
      exam_prep_id: prepId,
      user_id: userId,
      topic_id: topic?.id ?? null,
      difficulty,
      voice_mode: false,
      payload,
      total: countTotal(kind, payload),
      status: "active",
      generation_id: crypto.randomUUID(),
      client_request_id: requestId,
      familiarity,
      mood,
      content_version: 1,
      updated_at: new Date().toISOString(),
    })
    .select(
      "id, status, payload, answers, answer_meta, score, total, generation_id, client_request_id, complete_request_id, content_version, updated_at, difficulty, voice_mode, started_at, expires_at",
    )
    .single();
  if (error || !row) return null;
  await Promise.all([
    upsertGenerationJob(service, { userId, prepId, nodeId, attemptId: row.id as string, clientRequestId: requestId, generationId: row.generation_id as string, status: "ready" }),
    !finish && topic?.id ? saveTopicLesson(service, { prepId, topicId: topic.id, payload }).catch(onNodeFailure("node_topic_lesson_save_failed", { prepId, topicId: topic.id })) : null,
    node.status !== "done"
      ? awaitLoggedWrite("node_status_ready_failed", { nodeId }, service.from("exam_prep_nodes").update({ status: "ready" }).eq("id", nodeId))
      : null,
  ]);
  if (finish) after(() => finish(row.id as string, row.generation_id as string).catch(onNodeFailure("node_outcome_finish_failed", { nodeId })));
  console.info("outcome_lesson_served", { nodeId, building: Boolean(finish) });
  const [publicPayload, wallet] = await Promise.all([
    publicPayloadForUser(service, userId, payload, lessonReviewCards, kind, prepLanguage(prep.learning_preferences), lessonFormat),
    readWalletBalance(service, userId),
  ]);
  return NextResponse.json({ ...attemptStartResponse(row, { kind, title, topicLabel, publicPayload, resumed: false }), ...wallet });
}
