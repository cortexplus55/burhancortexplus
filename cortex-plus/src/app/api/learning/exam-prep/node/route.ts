import { NextResponse, after } from "next/server";
import { recordOpenTiming, servedOpenPath } from "@/lib/admin/beta-metrics";
import { createServiceClient } from "@/lib/supabase/server";
import { commitCredits, refundCredits, refusalCode, reserveCredits } from "@/lib/credits/service";
import { PREFETCH_HEADER, PREFETCH_KINDS, adoptedPrefetchAttempt, canAffordLesson, claimPrefetchSlot, dropPrefetch, nodeHasAttempts, nodeHasOpenAttempt, peekBuildingPrefetch, peekPrefetchedLesson, prefetchVariant, publishPrefetchPartial, requestBlockPracticePrefetch, requestNextPrefetch, requestNodePrefetch, storePrefetchedLesson, takePrefetchedLesson, verifyPrefetchToken, waitForPrefetchReady } from "@/lib/learning/lesson-prefetch";
import { studentOptionCount } from "@/lib/learning/student-pedagogy";
import { lessonQuizContext, loadTopicLessons, type LessonQuizContext } from "@/lib/learning/lesson-quiz-context";
import { quizPrefetchStorable, refreshQuizPrefetchAfterLesson, tagQuizPrefetchClaim, topicLessonInFlight } from "@/lib/learning/topic-test-prefetch";
import { loadTopicSupport, supportPagesForEngine } from "@/lib/learning/topic-support-load";
import { awardStars } from "@/lib/stars/award";
import { prepStarRef, prepStars } from "@/lib/stars/rules";
import { istanbulDay } from "@/lib/istanbul-day";
import { podcastCheckOf, podcastPayloadEpisode } from "@/lib/learning/podcast-check";
import { fillPodcastCheckLater } from "@/lib/learning/podcast-check-later";
import type { SupabaseClient } from "@supabase/supabase-js";
import { errorResponse, withUser } from "@/lib/api/guards";
import { PDF_LEARNING_V2_FLAG, isFeatureEnabled } from "@/lib/admin/feature-flags";
import { isPremiumUser } from "@/lib/ai/generate";
import { getUserEntitlements, requireFeature } from "@/lib/billing/entitlements";
import { EMPTY_SOURCE_CONTEXT, loadPageSourceAcrossDocuments, loadPageSourceContext, loadSourceContext, pagesMarkedInSource, widenSourcePages } from "@/lib/learning/source-context";
import { oralPlanBrief } from "@/lib/learning/oral-scope";
import { enrichLessonSource, resolveLessonSource, type SourceTrace, type SourceUnavailableReason } from "@/lib/learning/lesson-source-resolver";
import { recordLessonGenerationFailure } from "@/lib/learning/lesson-generation-failures";
import { prepSourceDocumentIds, resolvePrepSourceMode, shouldSearchSources, topicFence } from "@/lib/learning/prep-source";
import { PLAN_NODE_META, weakPracticeTitle, type PlanNodeKind } from "@/lib/learning/exam-prep-plan";
import { nodeNeedsStudentUnlock, pickPracticeNodeId, practiceHref, studentMayStartNode, topicLabelsMatch } from "@/lib/learning/study-tools";
import { loadLevelHint } from "@/lib/learning/prep-level";
import { prepTopicMatch } from "@/lib/learning/prep-topic-lookup";
import { contentSpansTopics, contentTestedTopic, safeTopicIds, topicIdsOf } from "@/lib/learning/topic-identity";
import { gradeOralExam, isOralLength, oralAttemptScore, syllabusWeightLineFromChecklist, type OralExamReport, type OralQuestionDraft } from "@/lib/learning/oral-exam";
import { freeMeterRemaining, kindListFilter, nodeFreeMeter, pathSkipKinds } from "@/lib/billing/node-free-meter";
import type { FreeMeter } from "@/lib/billing/free-meters";
import { billingExempt } from "@/lib/billing/free-preview";
import { DEFAULT_MOOD, contentDifficultyLine, parseFamiliarity, parseMood } from "@/lib/learning/session-signals";
import type { QuizQuestion } from "@/lib/learning/exam-quiz";
import { cardsAsShown, extractMisconceptions, freezeShownCards, parseSessionMeta } from "@/lib/learning/teaching-standards";
import { buildLessonRetryCheck, gradeSectionCheck, resolveCheckForGrade, sealSectionCheck, type CheckGradeVariant, type LessonCheckAnswer } from "@/lib/learning/lesson-play";
import { readLessonV2 } from "@/lib/learning/lesson-v3";
import { buildingPayload, isBuilding, isStaleBuild, truncatedPayload } from "@/lib/learning/lesson-build";
import { practiceTopicKey, settledQuizPayload } from "@/lib/learning/quiz-delivery";
import { savedReviewPayload } from "@/lib/learning/saved-review";
import { isAdminUser } from "@/lib/auth/roles";
import { honestReadingMinutes } from "@/lib/learning/lesson-coherence";
import { activityDurationMinutes } from "@/lib/learning/activity-duration";
import { podcastLengthSpec } from "@/lib/learning/podcast-formats";
import { loadPodcastCorpus, mergePodcastSource, parsePodcastLength, podcastScopeBrief, writePodcastCache } from "@/lib/learning/podcast-episode";
import { loadPrepDocumentIds, loadTopicTeaching } from "@/lib/documents/teacher-analysis-run";
import { prepLanguage, type TeachingPriority } from "@/lib/learning/teacher-brain";
import { recordLearningTrackingAfterComplete, stripAnswerMeta } from "@/lib/learning/learning-tracking-persist";
import { recordMistakes } from "@/lib/learning/mistake-notebook";
import { scheduleReviewsAfterComplete } from "@/lib/learning/review-items-store";
import { recordUserActivity } from "@/lib/streak/record-activity";
import { creditIdempotencyKeyForStart, isCreatingStale, mergeAnswersForScoring, shouldReuseExistingStart } from "@/lib/learning/attempt-lifecycle";
import { buildLocalSessionPayload, gapsNothingOpenPayload, isPathTurn, spacedReviewGate } from "@/lib/learning/exam-local-session";
import { adaptPathAfterResult } from "@/lib/learning/adaptive-path";
import { adaptiveFocusTopic } from "@/lib/learning/path-change";
import { PREP_WIDE_TARGET_KINDS } from "@/lib/learning/prep-wide-target";
import { retargetNodeTopic } from "@/lib/learning/prep-wide-target-server";
import { fastAllowedFor } from "@/lib/learning/fast-access";
import { attemptStartResponse, findAttemptByClientRequest, findResumableAttempt, saveAnswersRpc, upsertGenerationJob, writtenExamDeadline } from "@/lib/learning/attempt-lifecycle-persist";
import { bodySchema } from "@/lib/learning/node/schema";
import { NodeGenerationError, TEACHER_PAGE_KINDS, actionForKind, afterResponse, countTotal, deferTask, readWalletBalance, scheduleAfter, settlePendingStart } from "@/lib/learning/node/shared";
import { reviewSourceBlock, writtenReviewForPayload } from "@/lib/learning/node/written-review";
import { gradeOralSemantics, loadOralAllSource, oralCorpus, oralNeedsJudge, oralReviewFromPayload } from "@/lib/learning/node/oral";
import { loadLessonReviewCards, rememberMisconceptions, unseenLessonReviews } from "@/lib/learning/node/misconceptions";
import { loadTopicLesson, saveTopicLesson } from "@/lib/learning/node/lesson-store";
import { claimCompletion, completedAttemptBody, completionClaimFresh, releaseCompletionClaim, storeCompletionResult, type CompletionOutcome } from "@/lib/learning/node/completion";
import { loadSectionBackbone, loadUpcomingTopicTitles } from "@/lib/learning/node/lesson";
import { loadPrepTopicIndex, sameTopicAsNode, testedTopicRow } from "@/lib/learning/node/topics";
import { publicPayloadForUser } from "@/lib/learning/node/payload";
import { mistakeDraftsFromAttempt, scoreAttempt } from "@/lib/learning/node/score";
import { generateNodePayload } from "@/lib/learning/node/generate";

/**
 * Üretim çağrısı 90 saniye, doğrulama ve geçici 5xx yeniden denemesi buna eklenir.
 * Tavan 300 saniye: bir zaman aşımı, kısa bekleme ve tek yeniden deneme
 * fonksiyon kesilmeden biter. Platform varsayılanı keserse öğrenci 502 görür
 * ve kredi iade edilir, ders kayda geçmez.
 */
export const maxDuration = 300;
/** Aynı seçimle yazılan önceden yazım sürüyorsa bekleme sınırı (konu testi; 24 Ekim 2026). */
const PREFETCH_MATCHED_WAIT_MS = 100_000;

export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  // Sıradaki dersin önceden yazımı: imzalı iç istek. Hemen kabul edilir,
  // ders yanıttan sonra yazılır — çağıran beklemez, bağlantısı kopsa da
  // yazım sürer.
  const prefetchHeader = request.headers.get(PREFETCH_HEADER);
  if (prefetchHeader !== null) {
    const caller = verifyPrefetchToken(prefetchHeader);
    if (!caller) return errorResponse(401, "AUTH_REQUIRED");
    const body = await request.json().catch(() => null);
    after(async () => {
      const result = await handleNodeRequest(
        { userId: caller.userId, service: createServiceClient() },
        body,
        { origin, prefetchNodeId: caller.nodeId },
      ).catch((error: unknown) => {
        console.error("lesson_prefetch_failed", {
          cause: error instanceof Error ? error.message.slice(0, 160) : "unknown",
        });
        return null;
      });
      if (result && result.status >= 400) {
        console.error("lesson_prefetch_failed", { status: result.status });
      }
    });
    return NextResponse.json({ ok: true, accepted: true }, { status: 202 });
  }

  const guard = await withUser(request, { scope: "exam-prep-node", limit: 16 });
  if (!guard.ok) return guard.response;
  return handleNodeRequest(guard.ctx, await request.json(), { origin, prefetchNodeId: null });
}

async function handleNodeRequest(
  ctx: { userId: string; service: SupabaseClient },
  rawBody: unknown,
  options: { origin: string; prefetchNodeId: string | null },
): Promise<NextResponse> {
  const { userId, service } = ctx;
  // Soğuk dersin rota zaman çizgisi (19 Ekim 2026): motor ilk kavramı 9,8 sn'de yayımlarken
  // öğrenci ilk ekranı 15 sn'de gördü — aradaki ~5 sn rotada. Nerede olduğu kayda yazılır.
  const requestStarted = Date.now();
  let peekBuildingMs: number | null = null;
  let generationLaunchedMs: number | null = null;
  let firstPublishedMs: number | null = null;

  const parsed = bodySchema.safeParse(rawBody);
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const { prepId, nodeId, action } = parsed.data;
  const lessonFormat: 2 | 3 = parsed.data.lessonFormat === 3 ? 3 : 2;
  // Önceden yazım yalnız imzalı iç istekten, imzadaki düğüm için.
  const prefetch = options.prefetchNodeId !== null;
  if (prefetch && (parsed.data.prefetch !== true || options.prefetchNodeId !== nodeId || action !== "start")) {
    return errorResponse(400, "invalid_input");
  }
  if (!prefetch && parsed.data.prefetch) return errorResponse(400, "invalid_input");
  const teachingV2 = await isFeatureEnabled(service, PDF_LEARNING_V2_FLAG);

  const { data: prep } = await service
    .from("exam_preps")
    .select(
      "id, title, exam_type, active_topic_id, target_score, learning_preferences, hard_topics_self",
    )
    .eq("id", prepId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!prep) return errorResponse(404, "not_found");

  const { data: node } = await service
    .from("exam_prep_nodes")
    .select("id, kind, title, status, sort_order, day_index, session_meta")
    .eq("id", nodeId)
    .eq("exam_prep_id", prepId)
    .maybeSingle();
  if (!node) return errorResponse(404, "not_found");
  // Öğrencinin kendi düğümü kilitliyken açılır (27 Ekim 2026). Gizli düğüm açılmaz.
  // Önceden yazım durumu değiştirmez. Bitirme kilitli düğümü reddettiği için giriş önce ready yapar.
  if (action === "choose") {
    if (nodeNeedsStudentUnlock(node.status)) {
      await service.from("exam_prep_nodes").update({ status: "ready" }).eq("id", nodeId).eq("status", "locked");
    }
    return NextResponse.json({ ok: true });
  }
  if (!prefetch && nodeNeedsStudentUnlock(node.status)) {
    await service.from("exam_prep_nodes").update({ status: "ready" }).eq("id", nodeId).eq("status", "locked");
  }
  if (!studentMayStartNode(node.status, node.kind as string) && !prefetch) return errorResponse(403, "node_locked");

  // `let`: hazırlık geneli düğüm zayıf konuya yönelebilir (aşağıda `retargetNodeTopic`).
  let sessionMeta = teachingV2 ? parseSessionMeta(node.session_meta) : null;
  const topicLookupId = sessionMeta?.topicId ?? prep.active_topic_id;
  // Belgeli hazırlıkta düğüm belgedeki konu düğümünü tutar; yalnız `id` ile arama konuyu bulmaz
  // (18 Ekim 2026: aşinalık kaydedilmiyor, konunun sayfa eşlemesi atlanıyordu).
  const topicMatch = topicLookupId ? prepTopicMatch(topicLookupId) : null;

  let { data: topic } = topicMatch
    ? await service
        .from("exam_prep_topics")
        .select("id, label, measured_level, document_topic_node_id, source_refs")
        .eq("exam_prep_id", prepId)
        .or(topicMatch)
        .limit(1)
        .maybeSingle()
    : await service
        .from("exam_prep_topics")
        .select("id, label, measured_level, document_topic_node_id, source_refs")
        .eq("exam_prep_id", prepId)
        .order("sort_order")
        .limit(1)
        .maybeSingle();

  let topicDocumentId: string | null = null;
  let topicNodeId: string | null = null;
  let topicSourceRefs = topic?.source_refs ?? null;
  if (topic?.id) {
    const nodeIdForTopic =
      typeof topic.document_topic_node_id === "string"
        ? topic.document_topic_node_id
        : null;
    topicNodeId = nodeIdForTopic;
    if (nodeIdForTopic) {
      const { data: topicNode } = await service
        .from("document_topic_nodes")
        .select("document_id")
        .eq("id", nodeIdForTopic)
        .maybeSingle();
      if (topicNode?.document_id) topicDocumentId = topicNode.document_id as string;
    }
  }

  const kind = node.kind as PlanNodeKind;
  let topicLabel =
    sessionMeta?.topicTitle?.trim() || topic?.label || prep.title || "Konu";
  const oralCount = isOralLength(parsed.data.oralQuestionCount ?? 0)
    ? parsed.data.oralQuestionCount
    : undefined;
  const requestedTopic = (
    (kind === "oral" ? parsed.data.oralTopicLabel?.trim() : "") ||
    parsed.data.activityTopicLabel?.trim() ||
    ""
  ).slice(0, 400);
  if (requestedTopic) topicLabel = requestedTopic;
  // Sözlüde seçilen konular kimlikle (30 Ekim 2026, `topic-identity.ts`). Canlı tur: "Enflasyon Türleri" seçilen sözlü
  // başka konunun düğümünde açıldı; ad düğümün konusuyla tutmayınca kaynak "konuyu genişlet" diye hazırlık adıyla
  // aranıyor, sorular üç konudan geliyordu. Tek konu → o konunun kaydı ve sayfaları (`retargetNodeTopic`); birden çok
  // konu → her konunun kendi sayfaları ve tek konuya kanıt yok (`scope: "topics"`); düğümün kendi konusu → genişletme yok.
  const oralTopicIds =
    kind === "oral" && parsed.data.oralScope !== "all" ? safeTopicIds(parsed.data.oralTopicIds) : [];
  const oralMultiTopic = oralTopicIds.length > 1;
  const oralSameTopic =
    oralTopicIds.length === 1 &&
    topicIdsOf({ id: topic?.id ?? null, documentTopicNodeId: topic?.document_topic_node_id ?? null }).includes(oralTopicIds[0]!);
  if (oralSameTopic && topic?.label) topicLabel = topic.label;
  let topicWiden =
    (kind === "oral" && parsed.data.oralScope === "all") ||
    oralMultiTopic ||
    (!oralSameTopic && Boolean(requestedTopic && !topicLabelsMatch(requestedTopic, sessionMeta?.topicTitle)));
  const difficulty = parsed.data.difficulty ?? "orta";
  const voiceMode = parsed.data.voiceMode ?? false;
  const familiarity = parseFamiliarity(parsed.data.familiarity);
  const mood = parseMood(parsed.data.mood);
  let title = PLAN_NODE_META[kind]?.setupLabel ?? node.title;
  const lessonReviewCards =
    kind === "spaced"
      ? await loadLessonReviewCards(service, userId, prepId, requestedTopic || sessionMeta?.topicTitle?.trim() || topic?.label || null)
      : [];

  // Önceden yazım yalnız açılmamış ders düğümü için; öğrenci açtıysa gerek yok.
  // Isınma yazımı (warm) bitmiş düğümü de yazar; yalnız süren bir kayıt varsa durur.
  const warm = prefetch && parsed.data.warm === true;
  if (prefetch) {
    if (!PREFETCH_KINDS.has(kind) || !teachingV2 || (node.status === "done" && !warm)) {
      return errorResponse(400, "invalid_input");
    }
    if (warm ? await nodeHasOpenAttempt(service, nodeId) : await nodeHasAttempts(service, nodeId)) {
      return NextResponse.json({ ok: true, skipped: "opened" });
    }
  }

  // Isınma (19 Ekim 2026, adım 3 "soğuk ders 10 sn"): öğrenci ders düğümünü açıp ruh hali
  // ekranına gelince yazım arka planda hızlı işlemle başlar; "Ders oluştur" basılınca yazımı süren
  // ders devralınır (peekBuildingPrefetch). Öğrenci kartlarda geçirdiği 5-10 sn'yi yazıma kazandırır.
  if (action === "warm") {
    const warmable = kind === "lesson" && teachingV2;
    if (warmable) {
      afterResponse(() =>
        requestNodePrefetch(
          service,
          {
            origin: options.origin,
            userId,
            prepId,
            node: { id: node.id as string, kind: node.kind as string, status: (node.status as string | null) ?? null, session_meta: node.session_meta },
          },
          { warm: true },
        ),
      );
    }
    return NextResponse.json({ ok: true, warming: warmable });
  }

  // "Hep bir adım önde" (18 Ekim 2026, ürün sahibinin kararı): öğrenci bir etkinliği açınca
  // yolundaki sıradaki hazırlanabilir etkinlik arka planda yazılır. Tek yer: her açılış buradan
  // geçer (hazır, devralınan, tekrar edilen, yeni yazılan). Kayıt ya da yazım varsa atlanır.
  if (!prefetch && action === "start") {
    afterResponse(() =>
      requestNextPrefetch(service, { origin: options.origin, userId, prepId, sortOrder: node.sort_order as number }),
    );
  }
  // Aynı konunun bloğu: test, doğru/yanlış ve kartlar ders açılınca yazılır. Test, ders kaydı
  // varken yazılır; ders sürerken rota o isteği boş çevirir, kayıt bitince aşağıdaki yenileme yazar.
  if (!prefetch && action === "start" && kind === "lesson") {
    const topicKey = practiceTopicKey(node.session_meta) ?? (topic?.id ? `id:${topic.id}` : null);
    afterResponse(() =>
      requestBlockPracticePrefetch(service, {
        origin: options.origin,
        userId,
        prepId,
        lessonSort: node.sort_order as number,
        topicKey,
      }),
    );
  }
  // Konu testi dersi bilir (20 Ekim 2026): ders kaydedilince sıradaki test derse göre yeniden hazırlanır.
  // Yenileme bitince bloktaki öbür test, doğru/yanlış ve kartlar yazılır. Sıradaki testin satırı
  // yenilemede açıldığı için ikinci kez üretilmez.
  const refreshTopicQuiz = (topicId: string | null | undefined) => {
    if (!topicId || !teachingV2) return;
    afterResponse(async () => {
      await refreshQuizPrefetchAfterLesson(service, {
        origin: options.origin,
        userId,
        prepId,
        afterSortOrder: node.sort_order as number,
        topicId,
      }).catch(() => undefined);
      await requestBlockPracticePrefetch(service, {
        origin: options.origin,
        userId,
        prepId,
        lessonSort: node.sort_order as number,
        topicKey: `id:${topicId}`,
      });
    });
  };

  if (action === "review") {
    if (kind !== "written_exam") return errorResponse(400, "invalid_input");
    const { data: done } = await service
      .from("exam_prep_node_attempts")
      .select("id, payload, answers, score, total")
      .eq("node_id", nodeId)
      .eq("user_id", userId)
      .eq("exam_prep_id", prepId)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!done) return NextResponse.json({ ok: true, review: null });
    const review = await writtenReviewForPayload(service, {
      userId,
      prepId,
      attemptId: done.id as string,
      nodeId,
      payload: done.payload,
      answers: (done.answers as Record<string, unknown> | null) ?? {},
      topicLabel,
      allowFill: false,
    });
    return NextResponse.json({
      ok: true,
      review,
      score: done.score ?? review?.score ?? 0,
      total: done.total ?? review?.total ?? 1,
    });
  }

  // Ders kontrolü: cevap verilmeden önce istemcide cevap yok; not sunucuda.
  // Design B: variant=retry iken aynı deterministik tekrar varyantı yeniden kurulur.
  if (action === "grade-check") {
    if (kind !== "lesson") return errorResponse(400, "invalid_input");
    const attemptId = parsed.data.attemptId;
    const sectionIndex = parsed.data.sectionIndex;
    const checkAnswer = parsed.data.checkAnswer as LessonCheckAnswer | undefined;
    const variant = (parsed.data.variant ?? "primary") as CheckGradeVariant;
    if (!attemptId || sectionIndex == null || !checkAnswer) {
      return errorResponse(400, "invalid_input");
    }
    const { data: attempt } = await service
      .from("exam_prep_node_attempts")
      .select("id, payload, status")
      .eq("id", attemptId)
      .eq("user_id", userId)
      .eq("exam_prep_id", prepId)
      .eq("node_id", nodeId)
      .maybeSingle();
    if (!attempt?.payload) return errorResponse(404, "not_found");
    // V2 ya da V3 kayıt: ekran i = bölüm i, ekranın sorusu bölümün sorusu.
    const lesson = readLessonV2((attempt.payload as { lesson?: unknown }).lesson);
    const section = lesson?.sections?.[sectionIndex];
    const primary = section?.check;
    if (!primary) return errorResponse(400, "invalid_input");
    const check = resolveCheckForGrade(
      primary,
      variant,
      prepLanguage(prep.learning_preferences),
      section?.body ?? "",
    );
    const result = gradeSectionCheck(check, checkAnswer);
    // Primary notlandırmadan sonra sealed retry gönderilir (cevap zaten açık).
    if (variant === "primary") {
      const retry = buildLessonRetryCheck(
        primary,
        prepLanguage(prep.learning_preferences),
        section?.body ?? "",
      );
      return NextResponse.json({
        ok: true,
        ...result,
        retryCheck: sealSectionCheck(retry),
      });
    }
    // Tekrarın "doğrusu" (22 Ekim 2026 inceleme): yazarın tam öğesi kendi doğrusunu taşır; kodun kurduğu tekrar
    // aynı olgunun başka ifadesidir (`sameFactOnly`), ana sorunun doğrusu ona da aittir; başka olgu kuran yedekler
    // ders yolunda çalışmaz. Eski "kök farklı, doğrusu aynıysa gizle" kuralı aynı doğruyu taşıyan tam öğenin kendi
    // doğrusunu da siliyordu.
    return NextResponse.json({ ok: true, ...result });
  }

  // Parça parça açılan ders veya test (18 Ekim 2026): yazım sürerken ekran buradan okur.
  if (action === "progress") {
    // Podcast (30 Ekim 2026): oynatıcı bitince arkada yazılan dinleme kontrolünü buradan alır (`checkPending`).
    if (kind !== "lesson" && kind !== "quiz" && kind !== "podcast") return errorResponse(400, "invalid_input");
    const attemptId = parsed.data.attemptId;
    if (!attemptId) return errorResponse(400, "invalid_input");
    const { data: attempt } = await service
      .from("exam_prep_node_attempts")
      .select("id, payload, generation_id, client_request_id")
      .eq("id", attemptId)
      .eq("user_id", userId)
      .eq("exam_prep_id", prepId)
      .eq("node_id", nodeId)
      .maybeSingle();
    if (!attempt?.payload || typeof attempt.payload !== "object") return errorResponse(404, "not_found");
    let stored = attempt.payload as Record<string, unknown>;
    if (isStaleBuild(stored)) {
      if (kind === "quiz") {
        const promised = typeof stored.promised === "number" ? stored.promised : 0;
        const got = Array.isArray(stored.questions) ? stored.questions.length : 0;
        // Söz verilen sayı dolmadan kapanan test öğrenciye bitmiş sınav gibi açılmaz.
        stored =
          promised > 0 && got < promised
            ? { type: "quiz", questions: [], generationFailed: true }
            : settledQuizPayload(stored);
        await service
          .from("exam_prep_node_attempts")
          .update({ payload: stored })
          .eq("id", attempt.id)
          .eq("generation_id", attempt.generation_id as string);
      } else {
      // Yazımı yürüten fonksiyon düştü: ders olduğu kadarıyla kapanır, kredi iade.
      stored = truncatedPayload(stored);
      await service
        .from("exam_prep_node_attempts")
        .update({ payload: stored })
        .eq("id", attempt.id)
        .eq("generation_id", attempt.generation_id as string);
      if (attempt.client_request_id) {
        const key = creditIdempotencyKeyForStart({ userId, nodeId, clientRequestId: attempt.client_request_id as string });
        const adoptedKey = (attempt.payload as { adoptedPrefetch?: unknown }).adoptedPrefetch === true;
        await settlePendingStart(service, { userId, key: adoptedKey ? `${key}_prefetched` : key, outcome: "refund" });
      }
      await recordLessonGenerationFailure(service, {
        userId,
        prepId,
        topicId: topic?.id ?? null,
        topicLabel,
        kind,
        stage: "generation",
        reason: "build_stalled",
        reasons: ["yazım ilerlemedi; ders olduğu kadarıyla kapandı"],
      });
      }
    }
    return NextResponse.json({
      ok: true,
      building: isBuilding(stored),
      payload: await publicPayloadForUser(service, userId, stored, lessonReviewCards, kind, prepLanguage(prep.learning_preferences), lessonFormat),
    });
  }

  // --- Stage 8: resume in-progress attempt (flag ON) ---
  if (action === "resume") {
    if (!teachingV2) return errorResponse(400, "invalid_input");
    // Yoklama (30 Ekim 2026, Paket I): istemci bitirmenin yanıtını alamadıysa ya da sunucu sözlüyü
    // arka planda notluyorsa bu kaydı sorar. Salt okuma: notlandırma başlatmaz, kredi düşmez.
    if (parsed.data.attemptId) {
      const { data: polled, error: pollError } = await service
        .from("exam_prep_node_attempts")
        .select("id, status, payload, answers, score, total, generation_id, complete_request_id, content_version, updated_at")
        .eq("id", parsed.data.attemptId)
        .eq("node_id", nodeId)
        .eq("user_id", userId)
        .eq("exam_prep_id", prepId)
        .maybeSingle();
      if (pollError) return errorResponse(503, "attempt_lookup_failed");
      if (!polled) return NextResponse.json({ ok: true, resumed: false, found: false });
      if (polled.status === "completed") {
        const nextAfter = async () => {
          const skip = await pathSkipKinds(service, userId);
          let query = service
            .from("exam_prep_nodes")
            .select("id")
            .eq("exam_prep_id", prepId)
            .gt("sort_order", node.sort_order);
          if (skip.size) query = query.not("kind", "in", kindListFilter(skip));
          return query.order("sort_order").limit(1).maybeSingle();
        };
        return NextResponse.json({
          ...(await completedAttemptBody(service, { userId, prepId, nodeId, attempt: polled, topicLabel, nextAfter })),
          resumed: false,
          completed: true,
          grading: false,
          attemptId: polled.id,
        });
      }
      return NextResponse.json({
        ok: true,
        resumed: false,
        completed: false,
        grading: completionClaimFresh(polled),
        // Açık kayıt: bitirme sunucuya ulaşmadı (ya da düştü). İstemci kaydı bu sürümle sürdürür.
        active: polled.status === "active",
        attemptId: polled.id,
        generationId: polled.generation_id,
        contentVersion: polled.content_version ?? 1,
        updatedAt: polled.updated_at ?? null,
      });
    }
    const attempt = await findResumableAttempt(service, {
      userId,
      prepId,
      nodeId,
    });
    if (!attempt?.payload) {
      return NextResponse.json({ ok: true, resumed: false });
    }
    // Bitirme gönderilmiş, notlandırma sürüyor: sorulara dönülmez, ekran sonucu bekler.
    if (completionClaimFresh(attempt)) {
      return NextResponse.json({ ok: true, resumed: false, grading: true, state: "grading", attemptId: attempt.id });
    }
    return NextResponse.json({
      ...attemptStartResponse(attempt, {
        kind,
        title,
        topicLabel,
        publicPayload: await publicPayloadForUser(service, userId, attempt.payload as Record<string, unknown>, lessonReviewCards, kind, prepLanguage(prep.learning_preferences), lessonFormat),
        resumed: true,
      }),
      // Tarayıcı taslağı bu zamandan yeniyse istemcide taslak üstün gelir (Paket I).
      updatedAt: attempt.updated_at ?? null,
      ...(await readWalletBalance(service, userId)),
    });
  }

  // --- Stage 8: mid-session answer save (flag ON) ---
  if (action === "save") {
    if (!teachingV2) return errorResponse(400, "invalid_input");
    const attemptId = parsed.data.attemptId;
    const generationId = parsed.data.generationId;
    const contentVersion = parsed.data.contentVersion;
    if (!attemptId || !generationId || contentVersion == null) {
      return errorResponse(400, "invalid_input");
    }
    const saved = await saveAnswersRpc(service, {
      userId,
      attemptId,
      generationId,
      expectedVersion: contentVersion,
      answers: parsed.data.answers ?? {},
      cursorIndex: parsed.data.cursorIndex,
    });
    if (!saved.ok) {
      if (saved.code === "stale_generation" || saved.code === "stale_version") {
        return errorResponse(409, saved.code);
      }
      if (saved.code === "attempt_not_active") {
        return errorResponse(409, "attempt_not_active");
      }
      return errorResponse(503, "save_failed");
    }
    return NextResponse.json({
      ok: true,
      contentVersion: saved.contentVersion,
      generationId: saved.generationId,
    });
  }

  if (action === "complete") {
    let attemptQuery = service
      .from("exam_prep_node_attempts")
      .select(
        "id, payload, total, score, status, answers, generation_id, client_request_id, complete_request_id, content_version, updated_at",
      )
      .eq("node_id", nodeId)
      .eq("user_id", userId)
      .eq("exam_prep_id", prepId);
    // Explicit attempt IDs prevent another tab's newer attempt being graded.
    attemptQuery = parsed.data.attemptId
      ? attemptQuery.eq("id", parsed.data.attemptId)
      : attemptQuery.eq("status", "active");
    const { data: attempt, error: attemptError } = await attemptQuery
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (attemptError) return errorResponse(503, "attempt_lookup_failed");
    if (!attempt) return errorResponse(409, "active_attempt_required");
    // Ücretsiz hesapta sıradaki Plus'a özel adım değil (24 Ekim 2026; tamamlama fonksiyonu da atlar).
    // Yalnız sıradaki gerektiğinde okunur: reddedilen tamamlama plan okumaz.
    let skipKindsRead: Promise<ReadonlySet<string>> | null = null;
    const skipKinds = () => (skipKindsRead ??= pathSkipKinds(service, userId));
    const nextAfter = async () => {
      const skip = await skipKinds();
      let query = service
        .from("exam_prep_nodes")
        .select("id")
        .eq("exam_prep_id", prepId)
        .gt("sort_order", node.sort_order);
      if (skip.size) query = query.not("kind", "in", kindListFilter(skip));
      return query.order("sort_order").limit(1).maybeSingle();
    };

    // Stale complete from an older generation must not overwrite a newer attempt.
    if (
      teachingV2 &&
      parsed.data.generationId &&
      attempt.generation_id &&
      parsed.data.generationId !== attempt.generation_id
    ) {
      return errorResponse(409, "stale_generation");
    }

    // Aynı istek ya da bitmiş kayıt → saklı sonuç (yeniden notlandırma yok). Eskiden aynı gövdeli iki dal vardı.
    if (teachingV2 && attempt.status === "completed") {
      return NextResponse.json(
        await completedAttemptBody(service, { userId, prepId, nodeId, attempt, topicLabel, nextAfter }),
      );
    }

    const mergedAnswers = teachingV2
      ? mergeAnswersForScoring(
          (attempt.answers as Record<string, unknown> | null) ?? {},
          parsed.data.answers ?? {},
        )
      : (parsed.data.answers ?? {});

    const answersForClaim = teachingV2 ? stripAnswerMeta(mergedAnswers) : mergedAnswers;

    /**
     * Notlandırma ve ardından gelen bütün yazımlar (30 Ekim 2026, Paket I). Sözlüde hakem çağrısı
     * dakikalar sürebiliyordu ve istemci bu süre boyunca "Gönderiliyor…"da bekliyordu; artık sözlü
     * yanıttan sonra (`after`) notlanır, istemci sonucu `resume` ile yoklar. Öbür türler aynı
     * kapanışı yanıt içinde koşar (hesap ucuz).
     */
    const runCompletion = async (background: boolean): Promise<CompletionOutcome> => {
      // Kartlar öğrencinin gördüğü listeyle notlanır (`cardsAsShown`, 30 Ekim 2026): oturum "8/10", sonuç "6/8" demesin.
      const shownPayload = cardsAsShown((attempt.payload ?? {}) as Record<string, unknown>, lessonReviewCards);
      // Bitişin konusu içeriğin sorduğu konudur (30 Ekim 2026, `topic-identity.ts`): öğrenci düğümün konusu dışında bir
      // konu seçtiyse (sözlü konu seçici, `?konu=`) içerik o konunun adını taşır. Önerilen pratik, yol uyarlaması, tekrar
      // ve Yanlışlar Defteri de o konuya gider; kayıt açılan düğümde kalır. Birden çok konuyu kapsayan içerikte konu yok.
      const spansTopics = contentSpansTopics(shownPayload);
      const topicIndex = await loadPrepTopicIndex(service, prepId);
      const tested = spansTopics ? null : testedTopicRow(topicIndex, shownPayload, topic);
      const doneTopicLabel = spansTopics ? null : (tested?.label ?? contentTestedTopic(shownPayload) ?? topicLabel);
      const canonicalTopicLabel = (label: string | null | undefined): string | null =>
        label ? (topicIndex.rowFor(label)?.label ?? label) : null;
      let scored = scoreAttempt(kind, shownPayload, mergedAnswers, teachingV2);
      let oralExtras: OralExamReport | null = null;
      if (kind === "oral" && attempt?.payload && attempt.status !== "completed") {
        const questions = ((attempt.payload as { questions?: OralQuestionDraft[] }).questions ?? []);
        const hasRubric = questions.some((question) => (question.expectedPoints ?? []).length > 0);
        if (hasRubric) {
          const source = await reviewSourceBlock(service, userId, prepId, nodeId);
          const grounding = await oralCorpus(service, userId, prepId, questions, doneTopicLabel ?? topicLabel);
          const sourceBlob = [source, grounding.corpus].filter((part) => part.trim()).join("\n\n");
          const premiumNow = await isPremiumUser(service, userId);
          // Tek hakem (29 Ekim 2026): soru bağlamsız olgu denetimi kalktı. Hakem düşerse bir kez daha
          // istenir; yine düşerse kelime örtüşmesi yedeği (APPROX notu) çalışır.
          const judgeInput = {
            service,
            userId,
            isPremium: premiumNow,
            questions,
            answers: mergedAnswers,
          };
          const semantics = (await gradeOralSemantics(judgeInput)) ?? (await gradeOralSemantics(judgeInput));
          const report = gradeOralExam(questions, mergedAnswers, sourceBlob, grounding.passages, semantics);
          const { data: practiceNodes } = await service
            .from("exam_prep_nodes")
            .select("id, kind, sort_order, session_meta")
            .eq("exam_prep_id", prepId);
          // Bitirme isteği kapsamı taşımaz: kapsam kayıtlı içerikten (`scope`), konu sorulan konudan (kimlikle).
          const practiceTopic = spansTopics
            ? null
            : tested
              ? { id: tested.id, documentTopicNodeId: tested.documentTopicNodeId, label: tested.label }
              : topicLabel;
          const practiceId = pickPracticeNodeId(
            (practiceNodes ?? []).map((row) => ({
              id: row.id as string,
              kind: row.kind as string,
              sortOrder: (row.sort_order as number) ?? 0,
              status: "ready",
              sessionMeta:
                row.session_meta && typeof row.session_meta === "object"
                  ? (row.session_meta as { topicId?: string; topicTitle?: string })
                  : null,
            })),
            practiceTopic,
          );
          // Önerilen pratik adımı sırada değilse açılır: öneriyi uygulama veriyor (yol sırayla açılır).
          if (practiceId) {
            await service.from("exam_prep_nodes").update({ status: "ready" }).eq("id", practiceId).eq("status", "locked");
          }
          report.nextStep = {
            label: report.weaknesses.length ? "Eksik konuda pratik" : "Çalışma yoluna dön",
            href: practiceHref(prepId, practiceId),
          };
          scored = oralAttemptScore(report);
          oralExtras = report;
        }
      }
      // Tamamlama fonksiyonu `p_total < 1`'i `invalid_score` ile reddeder; öğrenci 503 görmesin.
      if (!(scored.total >= 1)) scored = { ...scored, score: 0, total: 1 };
      const answersForRpc = teachingV2 ? stripAnswerMeta(mergedAnswers) : mergedAnswers;

      // Sonuca göre yol (20 Ekim 2026): düşük sonuçta konunun odaklı pratiği araya girer, yüksekte
      // konunun kalan ek testleri kalkar. RPC'den önce: eklenen düğümü RPC sıradaki olarak açar.
      // Birden çok konuyu kapsayan içerik (sözlü "Tüm sınav" / çoklu seçim) tek konunun yolunu değiştirmez.
      const pathChange =
        attempt.status !== "completed" && !spansTopics
          ? await adaptPathAfterResult(service, {
              prepId,
              node: {
                id: nodeId,
                kind,
                sortOrder: (node.sort_order as number) ?? 0,
                dayIndex: (node.day_index as number) ?? 1,
                sessionMeta:
                  node.session_meta && typeof node.session_meta === "object" ? (node.session_meta as Record<string, unknown>) : null,
              },
              topicLabel: doneTopicLabel ?? topicLabel,
              // İçerik düğümün konusu dışında bir konuyu sorduysa yol o konuya göre değişir (kimlik düğüm biçiminde).
              testedTopic:
                tested && !sameTopicAsNode(node.session_meta, tested)
                  ? { topicId: tested.documentTopicNodeId ?? tested.id, topicTitle: tested.label }
                  : null,
              // Sözlüde kayıt yüzde (x/100); yol kararı soru sayısıyla (en az 3 öğe kuralı) verilir.
              score: oralExtras ? (oralExtras.pct / 100) * oralExtras.total : scored.score,
              total: oralExtras ? oralExtras.total : scored.total,
            }).catch(() => null)
          : null;

      const { data: completed, error: completeError } = await service.rpc("complete_exam_prep_node", {
        p_user_id: userId,
        p_prep_id: prepId,
        p_node_id: nodeId,
        p_attempt_id: attempt.id,
        p_score: scored.score,
        p_total: scored.total,
        p_answers: answersForRpc,
      });
      if (completeError || !completed) return { ok: false, code: "completion_failed" };
      // Etkinlik bitince pencere bir adım kayar (25 Ekim 2026, canlı test P1-1): ders biter bitmez
      // sıradaki test/kart yazılmaya başlar; öğrenci "Devam et"e bastığında hazırdır. Yazım varsa atlanır.
      if (attempt.status !== "completed") {
        deferTask(
          () => requestNextPrefetch(service, { origin: options.origin, userId, prepId, sortOrder: node.sort_order as number }),
          background,
        );
      }

      if (teachingV2 && parsed.data.completeRequestId) {
        await service
          .from("exam_prep_node_attempts")
          .update({
            complete_request_id: parsed.data.completeRequestId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", attempt.id)
          .is("complete_request_id", null);
      }

      if (!teachingV2 && oralExtras) {
        const payloadForEvidence = {
          ...((attempt.payload as object) ?? {}),
          gradeMeta: oralExtras,
        };
        await service
          .from("exam_prep_node_attempts")
          .update({ payload: payloadForEvidence })
          .eq("id", attempt.id);
        const drafts = extractMisconceptions({
          kind,
          payload: payloadForEvidence,
          answers: answersForRpc,
          topicLabel,
          language: prepLanguage(prep.learning_preferences),
        }).filter((draft) => draft.sourceKind === "oral");
        if (drafts.length) {
          await rememberMisconceptions(
            service,
            drafts.map((d) => ({
              user_id: userId,
              exam_prep_id: prepId,
              node_id: nodeId,
              attempt_id: attempt.id,
              topic_label: d.topicLabel,
              claim: d.claim,
              corrected: d.corrected,
              wrong_type: d.wrongType,
              source_kind: d.sourceKind,
              question_preview: d.questionPreview,
            })),
          );
        }
      }

      let nextHref = completed.nextId
        ? `/deneme-sinavlari/${prepId}/dugum/${completed.nextId}`
        : `/deneme-sinavlari/${prepId}`;
      let learningTracking: unknown = null;
      /** Sonuçtan sonra "+%X kazandın" kartı (19 Ekim 2026); kanıt üreten etkinliklerde dolu. */
      let topicGain: { label: string; before: number; after: number } | null = null;

      if (teachingV2) {
        let payloadForEvidence: unknown = shownPayload;
        if (oralExtras) {
          payloadForEvidence = {
            ...shownPayload,
            gradeMeta: oralExtras,
          };
          await service
            .from("exam_prep_node_attempts")
            .update({ payload: payloadForEvidence })
            .eq("id", attempt.id);
        } else if (shownPayload.type === "cards" && shownPayload !== attempt.payload) {
          // Dondurulmamış eski kart kaydı: notlanan liste kayda geçer; sonuç sayfası ve inceleme aynı kartları okur.
          payloadForEvidence = freezeShownCards(shownPayload, []);
          await service
            .from("exam_prep_node_attempts")
            .update({ payload: payloadForEvidence })
            .eq("id", attempt.id)
            .then(undefined, () => undefined);
        }

        const drafts = extractMisconceptions({
          kind,
          payload: payloadForEvidence,
          answers: answersForRpc,
          topicLabel: doneTopicLabel ?? topicLabel,
          language: prepLanguage(prep.learning_preferences),
        });
        const fresh = await unseenLessonReviews(service, userId, prepId, drafts);
        if (fresh.length) {
          await rememberMisconceptions(
            service,
            fresh.map((d) => ({
              user_id: userId,
              exam_prep_id: prepId,
              node_id: nodeId,
              attempt_id: attempt.id,
              // Yanılgının konusu hazırlığın konu adıyla (tek eşleştirici); eşleşmeyen ad olduğu gibi kalır.
              topic_label: canonicalTopicLabel(d.topicLabel),
              claim: d.claim,
              corrected: d.corrected,
              wrong_type: d.wrongType,
              source_kind: d.sourceKind,
              question_preview: d.questionPreview,
            })),
          );
        }

        try {
          const tracked = await recordLearningTrackingAfterComplete(service, {
            userId,
            prepId,
            nodeId,
            attemptId: attempt.id,
            kind,
            payload: payloadForEvidence,
            answers: mergedAnswers,
            topicLabel: doneTopicLabel ?? topicLabel,
            sessionObjective: sessionMeta?.objective ?? null,
            targetScore:
              typeof prep.target_score === "number" ? prep.target_score : null,
            skipKinds: await skipKinds(),
          });
          learningTracking = tracked.tracking;
          topicGain = tracked.topicGain;
          // Sonuç sayfası "+%X" aşamasını kayıttan okur (29 Ekim 2026); kazanç yoksa kayda bir şey yazılmaz.
          if (tracked.topicGain) {
            await service
              .from("exam_prep_node_attempts")
              .update({ payload: { ...((payloadForEvidence as object) ?? {}), topicGain: tracked.topicGain } })
              .eq("id", attempt.id)
              .then(undefined, () => undefined);
          }
          if (tracked.nextNodeId) {
            nextHref = `/deneme-sinavlari/${prepId}/dugum/${tracked.nextNodeId}`;
          }
        } catch {
          // Tracking is additive; completion already succeeded.
        }

        if (attempt.client_request_id || parsed.data.clientRequestId) {
          const reqId = attempt.client_request_id ?? parsed.data.clientRequestId!;
          if (attempt.generation_id) {
            await upsertGenerationJob(service, {
              userId,
              prepId,
              nodeId,
              attemptId: attempt.id,
              clientRequestId: reqId,
              generationId: attempt.generation_id,
              status: "completed",
            });
          }
        }
      }

      // Quiz / TF yanlışlarını Yanlışlar Defteri'ne yaz; streak gerçek çalışmayla artsın.
      try {
        const drafts = mistakeDraftsFromAttempt(
          attempt.id as string,
          shownPayload,
          mergedAnswers,
          doneTopicLabel ?? topicLabel,
        );
        if (drafts.length) await recordMistakes(service, userId, drafts);
        await recordUserActivity(service, userId, `exam_prep_${kind}`);
      } catch {
        // Notebook / streak must not roll back a completed node.
      }

      // Günü gelen tekrar (20 Ekim 2026, ürün sahibinin kararı): kaçırılan soru ve dersin sınav noktası
      // 1-3-7-14 gün sonra hazırlık sayfasında yeniden sorulur. Kayıt kopyadır, model çağrısı yok; yol,
      // önceden yazım ve tamamlama RPC'si değişmez. Anahtar (spaced_review) içeride; hata 0 döner.
      const reviewScheduled = await scheduleReviewsAfterComplete(service, {
        userId,
        prepId,
        nodeId,
        attemptId: attempt.id as string,
        kind,
        payload: shownPayload,
        answers: mergedAnswers,
        // Tekrar satırı da sorulan konuya (kimlikle); birden çok konuyu kapsayan içerikte konu yok.
        topicLabel: spansTopics ? null : (doneTopicLabel ?? topicLabel),
        topicId: spansTopics ? null : (tested?.id ?? (topic?.id as string | undefined) ?? null),
        oralReport: oralExtras ?? oralReviewFromPayload(attempt.payload),
      }).catch(() => 0);

      let review = null;
      if (kind === "written_exam") {
        review = await writtenReviewForPayload(service, {
          userId,
          prepId,
          attemptId: attempt.id as string,
          nodeId,
          payload: attempt.payload,
          answers: answersForRpc,
          topicLabel,
          allowFill: true,
        }).catch(() => null);
      }

      // Yıldızlar (17 Ekim 2026, Astra'daki gibi): sonuç ekranında "+N yıldız". Aynı deneme bir kez sayılır; kayıtlı
      // içeriğin tekrarı düğüm başına günde bir kez (`prepStarRef`, 30 Ekim 2026).
      const stars = await awardStars(service, {
        userId,
        source: "prep",
        ref: prepStarRef({ attemptId: attempt.id as string, nodeId, payload: attempt.payload, day: istanbulDay() }),
        amount: prepStars(kind, completed.score, completed.total),
      });

      const body: Record<string, unknown> = {
        ok: true,
        score: completed.score,
        total: completed.total,
        stars,
        retried: scored.retried,
        nextHref,
        learningTracking,
        topicGain,
        // Astra: iki sonuç aynı yönü gösterince "fazla zor / kolay gelebilir" (18 Ekim 2026).
        levelHint: await loadLevelHint(service, prepId).catch(() => null),
        pathChange,
        reviewScheduled,
        state: "completed",
        review,
        oralReview: oralExtras ?? oralReviewFromPayload(attempt.payload),
        ...(await readWalletBalance(service, userId)),
      };
      return { ok: true, body };
    };

    // Çift notlandırma yok: tamamlama, kaydı `complete_request_id` ile sahiplenir. Sahiplenilmiş açık
    // kayıt "notlanıyor" demektir; ikinci istek yeniden notlamaz, yalnız "bekle" der.
    const claimId = parsed.data.completeRequestId ?? crypto.randomUUID();
    const claim =
      teachingV2 && attempt.status === "active"
        ? await claimCompletion(service, {
            attemptId: attempt.id as string,
            current: (attempt.complete_request_id as string | null) ?? null,
            updatedAt: (attempt.updated_at as string | null | undefined) ?? null,
            claimId,
            answers: answersForClaim,
          })
        : "unknown";
    if (claim === "busy") {
      return NextResponse.json({ ok: true, grading: true, state: "grading", attemptId: attempt.id });
    }
    const releaseClaim = () =>
      claim === "claimed" ? releaseCompletionClaim(service, attempt.id as string, claimId) : Promise.resolve();

    if (claim === "claimed" && kind === "oral" && parsed.data.gradingAsync === true && oralNeedsJudge(attempt.payload)) {
      const scheduled = scheduleAfter(async () => {
        const outcome = await runCompletion(true).catch((error: unknown) => {
          console.error("oral_grading_failed", {
            cause: error instanceof Error ? error.message.slice(0, 160) : "unknown",
          });
          return null;
        });
        if (!outcome?.ok) {
          // Sahiplik bırakılır: istemcinin yoklaması kaydı açık görüp bitirmeyi yeniden gönderir.
          await releaseClaim().catch(() => undefined);
          return;
        }
        await storeCompletionResult(service, attempt.id as string, outcome.body).catch(() => undefined);
      });
      if (scheduled) {
        return NextResponse.json({ ok: true, grading: true, state: "grading", attemptId: attempt.id });
      }
    }

    let outcome: CompletionOutcome;
    try {
      outcome = await runCompletion(false);
    } catch (error) {
      await releaseClaim().catch(() => undefined);
      throw error;
    }
    if (!outcome.ok) {
      await releaseClaim().catch(() => undefined);
      return errorResponse(503, outcome.code);
    }
    return NextResponse.json(outcome.body);
  }

  // Stage 8: same clientRequestId → reuse attempt (no second charge / content).
  let clientRequestId = teachingV2 ? parsed.data.clientRequestId : undefined;
  const existingForKey =
    teachingV2 && clientRequestId
      ? await findAttemptByClientRequest(service, {
          userId,
          nodeId,
          clientRequestId,
        })
      : null;

  if (teachingV2 && existingForKey) {
    const reuse = shouldReuseExistingStart({
      status: existingForKey.status,
      hasPayload: Boolean(existingForKey.payload),
    });
    if (reuse === "return_ready" && existingForKey.payload) {
      return NextResponse.json({
        ...attemptStartResponse(existingForKey, {
          kind,
          title,
          topicLabel,
          publicPayload: await publicPayloadForUser(service, userId, existingForKey.payload as Record<string, unknown>, lessonReviewCards, kind, prepLanguage(prep.learning_preferences), lessonFormat),
          resumed: true,
        }),
        ...(await readWalletBalance(service, userId)),
      });
    }
    if (reuse === "reject_failed") {
      // Client must mint a new request id after a failed generation.
      return errorResponse(409, "generation_failed_retry");
    }
    if (
      reuse === "resume_creating" &&
      existingForKey.payload &&
      !isCreatingStale(existingForKey.updated_at)
    ) {
      // Rare: payload landed but status not flipped — treat as ready.
      return NextResponse.json({
        ...attemptStartResponse(
          { ...existingForKey, status: "active" },
          {
            kind,
            title,
            topicLabel,
            publicPayload: await publicPayloadForUser(service, userId, existingForKey.payload as Record<string, unknown>, lessonReviewCards, kind, prepLanguage(prep.learning_preferences), lessonFormat),
            resumed: true,
          },
        ),
        ...(await readWalletBalance(service, userId)),
      });
    }
    if (reuse === "resume_creating" && !isCreatingStale(existingForKey.updated_at)) {
      return errorResponse(409, "generation_in_progress");
    }
  }

  // Without a client key, prefer resuming an active attempt over a new charge.
  if (teachingV2 && !clientRequestId) {
    const resumable = await findResumableAttempt(service, {
      userId,
      prepId,
      nodeId,
    });
    if (resumable?.payload) {
      return NextResponse.json({
        ...attemptStartResponse(resumable, {
          kind,
          title,
          topicLabel,
          publicPayload: await publicPayloadForUser(service, userId, resumable.payload as Record<string, unknown>, lessonReviewCards, kind, prepLanguage(prep.learning_preferences), lessonFormat),
          resumed: true,
        }),
        ...(await readWalletBalance(service, userId)),
      });
    }
  }

  let practiceTopics: string[] | undefined;
  let finalFill: { seed: QuizQuestion[]; topics: string[]; perTopic: number; previousStems?: string[] } | null = null;
  // Bilgi boşlukları ve Tekrar kilitliyse (Astra, 1 Ekim 2026) ücretsiz
  // "kilitli" cevabı döner. Bitmiş düğüm yeniden açılırken kilit sorulmaz.
  const lockable = (kind === "gaps" || kind === "spaced") && node.status !== "done";
  if (kind === "focused" || kind === "final_check" || kind === "readiness" || lockable) {
    let local: Awaited<ReturnType<typeof buildLocalSessionPayload>>;
    try {
      local =
        kind === "spaced"
          ? await spacedReviewGate(service, prepId)
          : await buildLocalSessionPayload(service, {
              userId,
              prepId,
              kind: kind as "focused" | "final_check" | "readiness" | "gaps",
              prepTitle: prep.title ?? "Hazırlık",
              targetScore: typeof prep.target_score === "number" ? prep.target_score : null,
              learningPreferences: prep.learning_preferences,
              // `?konu=` (22 Ekim 2026 inceleme): seçilen konu önce hazır sorulardan; yoksa üretim ve yeniden
              // hedefleme. Seçim yoksa uyarlamalı odaklı pratiğin konusu.
              focusTopic: (kind === "focused" && requestedTopic) || adaptiveFocusTopic(kind, node.session_meta, topicLabel),
            });
    } catch {
      return errorResponse(503, "generation_failed");
    }
    // Yolda sırası gelen "Bilgi boşlukları" kilitli dönerse yol orada durur (20 Ekim 2026): adımı
    // tamamlayacak düğme yok. Sırası gelmişse kapatılacak boşluk olmadığı söylenir, adım biter.
    if (local.action === "serve" && local.payload.locked === true && kind === "gaps" && (await isPathTurn(service, prepId, node))) {
      local = gapsNothingOpenPayload();
    }
    if ((kind === "gaps" || kind === "focused") && local.topics?.length) {
      // Tek konu (30 Ekim 2026, Paket I #8, `rankFinalStepTopics`): etiket, oturum başlığı, sorular ve kanıt
      // aynı konu. Hazır sorular yalnız bu konudan seçildi; içerik konuyu taşır.
      const chosen = local.topics[0]!;
      title = weakPracticeTitle(kind, [chosen]);
      topicLabel = chosen;
      if (local.action === "serve" && local.payload.type === "quiz" && typeof local.payload.testedTopic !== "string") {
        local = { ...local, payload: { ...local.payload, testedTopic: chosen } };
      }
    }
    if (local.action === "serve" && local.payload.locked === true) {
      // Kayıt açılmaz: kilit kalkınca düğüm temiz başlasın.
      return NextResponse.json({ ok: true, kind, title, topicLabel, voiceMode: false, payload: local.payload });
    }
    if (local.action === "serve") {
      const questions = (local.payload.questions as unknown[] | undefined) ?? [];
      const total = local.payload.type === "quiz" ? Math.max(1, questions.length) : 1;
      const row = {
        node_id: nodeId,
        exam_prep_id: prepId,
        user_id: userId,
        topic_id: topic?.id ?? null,
        difficulty,
        voice_mode: false,
        payload: local.payload,
        total,
        status: "active" as const,
        familiarity,
        mood,
        ...(clientRequestId ? { client_request_id: clientRequestId } : {}),
      };
      let { data: created, error: insertError } = await service
        .from("exam_prep_node_attempts")
        .insert(row)
        .select("id")
        .single();
      if (insertError && clientRequestId) {
        const raced = await findAttemptByClientRequest(service, {
          userId,
          nodeId,
          clientRequestId,
        });
        if (raced?.id) {
          created = { id: raced.id };
          insertError = null;
        }
      }
      if (insertError || !created) return errorResponse(500, "generation_failed");
      if (node.status !== "done") {
        const meta =
          node.session_meta && typeof node.session_meta === "object" && !Array.isArray(node.session_meta)
            ? { ...(node.session_meta as Record<string, unknown>) }
            : {};
        await service
          .from("exam_prep_nodes")
          .update({
            status: "ready",
            ...((kind === "gaps" || kind === "focused") && local.topics?.length
              ? { title, session_meta: { ...meta, topicTitle: local.topics[0] } }
              : {}),
          })
          .eq("id", nodeId);
      }
      return NextResponse.json({
        ok: true,
        attemptId: created.id,
        kind,
        title,
        topicLabel,
        voiceMode: false,
        payload: await publicPayloadForUser(service, userId, local.payload, lessonReviewCards, kind, prepLanguage(prep.learning_preferences), lessonFormat),
        ...(await readWalletBalance(service, userId)),
      });
    }
    practiceTopics = local.topics;
    if (local.fill) {
      finalFill = {
        seed: local.fill.seed,
        topics: local.topics,
        perTopic: local.fill.perTopic,
        previousStems: local.fill.previousStems,
      };
    }
  }

  // Hazırlık geneli düğüm ve `?konu=` (20 Ekim 2026, prep-wide-target.ts): düğümün devraldığı 1.
  // konu yerine öğrencinin zayıf konusu ya da seçtiği konu; istem, kaynak ve kanıt aynı konuyu
  // söyler. Konu kaydı bulunamazsa düğüm devraldığı konuyla açılır — istek düşmez.
  let retargetedTopic: string | null = null;
  if (teachingV2 && !oralMultiTopic && !oralSameTopic) {
    const retarget = await retargetNodeTopic(service, {
      userId,
      prepId,
      kind,
      requestedTopic,
      requestedTopicId: oralTopicIds[0] ?? null,
      adaptiveFocus: adaptiveFocusTopic(kind, node.session_meta, topicLabel),
      practiceTopics,
      inheritedTopicTitle: sessionMeta?.topicTitle ?? null,
      currentTopicId: topic?.id ?? null,
    }).catch(() => null);
    if (retarget) {
      topic = retarget.topic;
      topicSourceRefs = retarget.topic.source_refs ?? null;
      topicDocumentId = retarget.topicDocumentId;
      topicNodeId = retarget.topicNodeId;
      topicLabel = retarget.topic.label;
      retargetedTopic = retarget.topic.label;
      // Devralınan hedef ve ünite 1. konunundu; kaynak aramasına ve isteme girmesin.
      sessionMeta = {
        ...(sessionMeta ?? {}),
        topicId: retarget.metaTopicId,
        topicTitle: retarget.topic.label,
        objective: undefined,
        unitTitle: undefined,
        sourcePages: retarget.sourcePages.length ? retarget.sourcePages : undefined,
      };
      topicWiden = kind === "oral" && parsed.data.oralScope === "all";
      if (kind === "gaps" || kind === "focused" || kind === "final_check") {
        practiceTopics = [retarget.topic.label];
        if (kind === "gaps" || kind === "focused") title = weakPracticeTitle(kind, practiceTopics);
      }
    }
  }

  const entitlements = await getUserEntitlements(service, userId);
  const premium = entitlements.isPremium;
  if (kind === "podcast" && !requireFeature(entitlements, "podcast")) {
    return errorResponse(402, "premium_required");
  }
  const voiceSession = voiceMode && (kind === "qa" || kind === "oral");
  // Ücretsiz katman sayıya dayalı (24 Ekim 2026): ders haftalık hakkı; konunun dersi açıldıysa ardındaki
  // test/kartlar derse dahil; podcast, sözlü, yazılı deneme Plus'ta. Abone ve kurucu (önizleme kapalı) yok.
  // Hazırlık geneli adımın kendi konusu yok: devraldığı 1. konu ya da yöneldiği zayıf konu sayacı
  // belirlemez, hazırlıkta herhangi bir ders açıldıysa derse dahil (`topicId: null`). Öğrenci konu
  // seçtiyse (`?konu=`) ya da uyarlamalı odaklı pratikse o konunun dersine bakılır.
  const prepWideStep =
    PREP_WIDE_TARGET_KINDS.has(kind) && !requestedTopic && !adaptiveFocusTopic(kind, node.session_meta, topicLabel);
  const meterless = premium || (await billingExempt(service, userId).catch(() => false));
  const nodeMeter = meterless
    ? null
    : await nodeFreeMeter(service, { userId, prepId, kind, topicId: prepWideStep ? null : (topic?.id ?? null) });
  if (nodeMeter === "plus") {
    if (prefetch) return NextResponse.json({ ok: true, skipped: "premium" });
    return errorResponse(402, "premium_required");
  }
  const freeMeter: FreeMeter | null = nodeMeter;

  if (prefetch && freeMeter) {
    // Ücretsiz öğrenciye açamayacağı dersi yazmıyoruz: haftalık ders hakkı bittiyse önceden yazım yok.
    if (freeMeter === "lesson" && (await freeMeterRemaining(service, userId, "lesson")) === 0) {
      return NextResponse.json({ ok: true, skipped: "free_limit" });
    }
  } else if (prefetch) {
    // Kredisi yetmeyen öğrenciye açamayacağı dersi yazmıyoruz.
    const { data: rule } = await service
      .from("credit_rules")
      .select("credit_cost")
      .eq("action_code", actionForKind(kind))
      .eq("active", true)
      .maybeSingle();
    if (
      typeof rule?.credit_cost === "number" &&
      !(await canAffordLesson(service, userId, rule.credit_cost))
    ) {
      return NextResponse.json({ ok: true, skipped: "credits" });
    }
  }

  // "Dersi tekrarla" (18 Ekim 2026) ve "Tekrar incele" (25 Ekim 2026): kayıtlı gövde
  // yeni bir denemede açılır — anında, kredisiz. Kayıt yoksa inceleme üretim başlatmaz.
  const reopenSaved = parsed.data.review === true && !voiceSession && !prefetch && kind !== "written_exam";
  const replayLesson = kind === "lesson" && teachingV2 && !voiceSession && !prefetch && parsed.data.replay === true;
  if (reopenSaved || replayLesson) {
    const { data: previous } = await service
      .from("exam_prep_node_attempts")
      .select("payload")
      .eq("node_id", nodeId)
      .eq("user_id", userId)
      .eq("exam_prep_id", prepId)
      .in("status", ["completed", "active"])
      .order("created_at", { ascending: false })
      .limit(5);
    const requestId = clientRequestId ?? crypto.randomUUID();
    const replayed = (previous ?? [])
      .map((row) => savedReviewPayload(row.payload, requestId))
      .find((item): item is Record<string, unknown> => Boolean(item));
    if (replayed) {
      const { data: replayAttempt, error: replayError } = await service
        .from("exam_prep_node_attempts")
        .insert({
          node_id: nodeId,
          exam_prep_id: prepId,
          user_id: userId,
          topic_id: topic?.id ?? null,
          difficulty,
          voice_mode: false,
          payload: replayed,
          total: countTotal(kind, replayed),
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
      if (!replayError && replayAttempt) {
        await upsertGenerationJob(service, {
          userId,
          prepId,
          nodeId,
          attemptId: replayAttempt.id as string,
          clientRequestId: requestId,
          generationId: replayAttempt.generation_id as string,
          status: "ready",
        });
        await service.from("study_session_moods").insert({ user_id: userId, exam_prep_id: prepId, node_id: nodeId, mood });
        console.info("lesson_replayed", { nodeId });
        return NextResponse.json({
          ...attemptStartResponse(replayAttempt, {
            kind,
            title,
            topicLabel,
            publicPayload: await publicPayloadForUser(service, userId, replayed, lessonReviewCards, kind, prepLanguage(prep.learning_preferences), lessonFormat),
            resumed: false,
          }),
          ...(await readWalletBalance(service, userId)),
        });
      }
    }
    if (reopenSaved) return errorResponse(404, "not_found");
  }

  // Yazımı süren hazır ders (18 Ekim 2026): ikinci kez yazılmaz, devralınır. Öğrenci
  // denetlenmiş kısmı hemen görür; kalanı önceden yazım yazdıkça kaydına düşer.
  if (kind === "lesson" && teachingV2 && !voiceSession && !prefetch && parsed.data.lessonStream === true) {
    const peekStarted = Date.now();
    // Hızlı işlemli öğrenci (Plus, kurucu) kısa bekler: soğuk yazımı ilk kavramı ~14 sn'de yayımlıyor; ısınma normal
    // hızda. Ücretsiz öğrencinin yazımı da normal hızda: başlamış ısınmanın ilk kavramı beklenir (24 Ekim 2026).
    const fastOpen = await fastAllowedFor(service, userId).catch(() => false);
    const building = await peekBuildingPrefetch(service, {
      userId,
      nodeId,
      familiarity,
      waitMs: fastOpen ? 8_000 : 20_000,
      extendForBuild: !fastOpen,
    });
    peekBuildingMs = Date.now() - peekStarted;
    if (building?.status === "building") {
      const requestId = clientRequestId ?? crypto.randomUUID();
      const reservation = await reserveCredits(
        service,
        userId,
        actionForKind(kind),
        `${creditIdempotencyKeyForStart({ userId, nodeId, clientRequestId: requestId })}_prefetched`,
        1,
        { freeMeter },
      );
      if (!reservation.ok) {
        return reservation.reason === "insufficient_credits"
          ? errorResponse(402, refusalCode(reservation))
          : errorResponse(409, "generation_in_progress");
      }
      const { data: adoptedRow, error: adoptError } = await service
        .from("exam_prep_node_attempts")
        .insert({
          node_id: nodeId,
          exam_prep_id: prepId,
          user_id: userId,
          topic_id: topic?.id ?? null,
          difficulty,
          voice_mode: false,
          payload: { ...building.payload, adoptedPrefetch: true },
          total: 1,
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
      if (adoptError || !adoptedRow) {
        await refundCredits(service, reservation.reservationId).catch(() => undefined);
        return errorResponse(500, "generation_failed", { refunded: true });
      }
      // Yarış: önceden yazım tam bu arada bittiyse hazır dersi hemen al.
      let served = adoptedRow;
      const finished = await takePrefetchedLesson(service, { userId, nodeId });
      if (finished) {
        const { data: done } = await service
          .from("exam_prep_node_attempts")
          .update({ payload: finished.payload, updated_at: new Date().toISOString() })
          .eq("id", adoptedRow.id)
          .select(
            "id, status, payload, answers, answer_meta, score, total, generation_id, client_request_id, complete_request_id, content_version, updated_at, difficulty, voice_mode, started_at, expires_at",
          )
          .single();
        if (done) served = done;
        await commitCredits(service, reservation.reservationId).catch(() => undefined);
        const topicId = topic?.id ?? finished.topicId;
        if (topicId) await saveTopicLesson(service, { prepId, topicId, payload: finished.payload });
        refreshTopicQuiz(topicId);
      }
      await upsertGenerationJob(service, {
        userId,
        prepId,
        nodeId,
        attemptId: adoptedRow.id as string,
        clientRequestId: requestId,
        generationId: adoptedRow.generation_id as string,
        status: "ready",
      });
      if (topic?.id) await service.from("exam_prep_topics").update({ familiarity }).eq("id", topic.id);
      await service.from("study_session_moods").insert({ user_id: userId, exam_prep_id: prepId, node_id: nodeId, mood });
      if (node.status !== "done") await service.from("exam_prep_nodes").update({ status: "ready" }).eq("id", nodeId);
      console.info("lesson_prefetch_adopted", { nodeId, finished: Boolean(finished) });
      // Beta çıkış ölçütü (19 Ekim 2026): açılış süresi günlükten başka yerde de kalsın.
      { const ms = Date.now() - requestStarted; after(() => recordOpenTiming(service, { userId, kind, path: "adopted", ms })); }
      return NextResponse.json({
        ...attemptStartResponse(served, {
          kind,
          title,
          topicLabel,
          publicPayload: await publicPayloadForUser(service, userId, served.payload as Record<string, unknown>, lessonReviewCards, kind, prepLanguage(prep.learning_preferences), lessonFormat),
          resumed: false,
        }),
        ...(await readWalletBalance(service, userId)),
      });
    }
  }

  // Konu testi konunun kaydedilmiş dersini bilir (20 Ekim 2026): yazar dersin sorularını ve
  // terimlerini görür; önceden yazılan testin anahtarı dersin parmak izini taşır.
  const topicLessons = kind === "quiz" && teachingV2 && topic?.id ? await loadTopicLessons(service, topic.id) : null;
  const quizLesson: LessonQuizContext | null = topicLessons ? lessonQuizContext(topicLessons.lessons, topicLessons.missing) : null;
  // Dersi yazılırken konu testi önceden yazılmaz; ders kaydedilince derse göre istenir (24 Ekim 2026).
  if (
    prefetch &&
    kind === "quiz" &&
    teachingV2 &&
    topic?.id &&
    !quizLesson &&
    (await topicLessonInFlight(service, { prepId, userId, topicId: topic.id }))
  ) {
    return NextResponse.json({ ok: true, skipped: "lesson_building" });
  }

  // Önceden yazılmış etkinlik (18 Ekim 2026'dan beri her hazırlanabilir tür): beklemeden gelir,
  // kredi şimdi düşer. Seçim (zorluk, podcast süresi, sözlü ayarları) tutmazsa yeniden yazılır.
  const variant = prefetchVariant(kind, {
    lessonKey: quizLesson?.key ?? null,
    optionCount: kind === "quiz" ? await studentOptionCount(service, userId, prep.title) : null,
    topicLabel,
    difficulty,
    podcastLength: parsed.data.podcastLength ?? null,
    oralQuestionCount: oralCount ?? null,
    oralScope: parsed.data.oralScope ?? null,
    mood,
  });
  let prefetchWaitMs = 0;
  if (PREFETCH_KINDS.has(kind) && kind !== "lesson" && teachingV2 && !voiceSession && !prefetch) {
    // Akışsız içerik kayda bütün düşer: yazımı sürüyorsa biraz bekle, ikinci kez yazma. Aynı seçimle yazılan
    // konu testi bitmek üzereyse daha uzun beklenir: sıfırdan yazmak ondan uzun sürer (24 Ekim 2026).
    const waitStarted = Date.now();
    await waitForPrefetchReady(service, { userId, nodeId, maxMs: 30_000, variant, matchedMaxMs: PREFETCH_MATCHED_WAIT_MS });
    prefetchWaitMs = Date.now() - waitStarted;
  }
  if (
    PREFETCH_KINDS.has(kind) &&
    teachingV2 &&
    !voiceSession &&
    !prefetch &&
    (await peekPrefetchedLesson(service, { userId, nodeId, familiarity, variant }))
  ) {
    const requestId = clientRequestId ?? crypto.randomUUID();
    const reservation = await reserveCredits(
      service,
      userId,
      actionForKind(kind),
      `${creditIdempotencyKeyForStart({ userId, nodeId, clientRequestId: requestId })}_prefetched`,
      1,
      { freeMeter },
    );
    if (!reservation.ok) {
      return reservation.reason === "insufficient_credits"
        ? errorResponse(402, refusalCode(reservation))
        : errorResponse(409, "generation_in_progress");
    }
    const taken = await takePrefetchedLesson(service, { userId, nodeId });
    if (taken) delete taken.payload.prefetchVariant;
    // Hazır kart destesi de gösterilecek listeyle kayda geçer (`freezeShownCards`).
    if (taken) taken.payload = freezeShownCards(taken.payload, lessonReviewCards);
    if (!taken) {
      // Aynı anda başka bir açılış aldı; bu istek dersi kendisi yazar.
      await refundCredits(service, reservation.reservationId).catch(() => undefined);
    } else {
      const { data: readyAttempt, error: readyErr } = await service
        .from("exam_prep_node_attempts")
        .insert({
          node_id: nodeId,
          exam_prep_id: prepId,
          user_id: userId,
          topic_id: topic?.id ?? taken.topicId,
          difficulty,
          voice_mode: false,
          payload: taken.payload,
          total: countTotal(kind, taken.payload),
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
      if (readyErr || !readyAttempt) {
        await refundCredits(service, reservation.reservationId).catch(() => undefined);
        return errorResponse(500, "generation_failed", { refunded: true });
      }
      // Önceden yazım önbellekten gelmiş podcast'se (hazırlığın podcast sayfası aynı konuyu yazmıştı)
      // bedelsiz: soğuk açılışta da önbellek ücret almıyor ve oynatıcı "hakkından düşülmedi" diyor.
      const cachedPodcast = kind === "podcast" && taken.payload.reused === true;
      if (cachedPodcast) await refundCredits(service, reservation.reservationId).catch(() => undefined);
      else await commitCredits(service, reservation.reservationId).catch(() => undefined);
      // 20 Ekim 2026: önceden yazılmış podcast açılıp ücreti alındıktan sonra önbelleğe girer. Önceden
      // hiç girmiyordu; "Yeniden dinle" aynı podcast'i yeniden yazıp yeniden ücret alıyordu. Açılmadan
      // önbelleğe girmez kuralı korunur (yazım `charge !== false` iken, burada açılıştan sonra).
      const servedPodcast = kind === "podcast" && !cachedPodcast ? podcastPayloadEpisode(taken.payload) : null;
      if (servedPodcast) {
        await writePodcastCache(service, { prepId, userId, topicLabel, episode: servedPodcast, check: podcastCheckOf(taken.payload) });
      }
      await upsertGenerationJob(service, {
        userId,
        prepId,
        nodeId,
        attemptId: readyAttempt.id as string,
        clientRequestId: requestId,
        generationId: readyAttempt.generation_id as string,
        status: "ready",
      });
      const topicId = topic?.id ?? taken.topicId;
      if (topicId) {
        if (kind === "lesson") await saveTopicLesson(service, { prepId, topicId, payload: taken.payload });
        if (kind === "lesson") refreshTopicQuiz(topicId);
        await service.from("exam_prep_topics").update({ familiarity }).eq("id", topicId);
      }
      await service.from("study_session_moods").insert({
        user_id: userId,
        exam_prep_id: prepId,
        node_id: nodeId,
        mood,
      });
      if (node.status !== "done") {
        await service.from("exam_prep_nodes").update({ status: "ready" }).eq("id", nodeId);
      }
      console.info("prefetch_served", { nodeId, kind });
      {
        const ms = Date.now() - requestStarted;
        // Önceden yazımın bitmesi beklendiyse "hazır" değil, devralınan açılış.
        const path = servedOpenPath(Math.max(peekBuildingMs ?? 0, prefetchWaitMs));
        after(() => recordOpenTiming(service, { userId, kind, path, ms }));
      }
      return NextResponse.json({
        ...attemptStartResponse(readyAttempt, {
          kind,
          title,
          topicLabel,
          publicPayload: await publicPayloadForUser(service, userId, taken.payload, lessonReviewCards, kind, prepLanguage(prep.learning_preferences), lessonFormat),
          resumed: false,
        }),
        ...(await readWalletBalance(service, userId)),
      });
    }
  }

  // Ders öğrencinin kendi kaynağından üretilsin. Hazırlığa bağlı bir belge
  // varsa yalnızca onun içinde, yoksa kullanıcının tüm belgelerinde aranıyor.
  //
  // document_id ayrı okunuyor: kolon migration ile geliyor ve ana select'e
  // eklenseydi, kod migration'dan önce dağıtıldığında her düğüm 404 verirdi.
  const { data: prepSource, error: sourceLookupError } = await service
    .from("exam_preps")
    .select("document_id, source_document_ids")
    .eq("id", prepId)
    .eq("user_id", userId)
    .maybeSingle();

  if (sourceLookupError || !prepSource) {
    await recordLessonGenerationFailure(service, {
      userId,
      prepId,
      topicId: topic?.id ?? null,
      topicLabel,
      kind,
      stage: "source",
      reason: "no_prep_documents",
      reasons: ["prep_lookup_failed"],
    });
    return errorResponse(503, "source_unavailable", {
      reason: "no_prep_documents",
      refunded: false,
    });
  }

  const prepDocs = teachingV2 ? await loadPrepDocumentIds(service, prepId) : [];
  if (topicDocumentId) prepSource.document_id = topicDocumentId;
  const teachingPlan = teachingV2
    ? await loadTopicTeaching(
        service,
        prepSource.document_id
          ? [prepSource.document_id as string, ...prepDocs]
          : prepDocs,
        topicLabel,
        sessionMeta?.sourcePages ?? [],
      )
    : {
        brief: "",
        priority: null as TeachingPriority | null,
        checklist: [],
        depth: { difficulty: "hard" as const, maxDraftAttempts: 2 as const, quizItems: 5, line: "" },
        examPoints: [] as string[],
      };

  let sourceBoundaryMode: "documents_only" | "allow_supporting" | null = null;
  if (teachingV2 && prepSource.document_id) {
    const { data: doc } = await service
      .from("documents")
      .select("source_boundary_mode")
      .eq("id", prepSource.document_id)
      .eq("user_id", userId)
      .maybeSingle();
    sourceBoundaryMode =
      (doc?.source_boundary_mode as "documents_only" | "allow_supporting" | null) ??
      "documents_only";
  }
  // Belge seçili değilse kaynak araması yapılmaz. Eskiden `sourceBoundaryMode
  // ?? "documents_only"` ile filtresiz arama yapılıyordu: öğrencinin ilgisiz
  // belgesinden gelen bir parça derse "yalnızca buna dayan" diye giriyordu.
  const sourceMode = resolvePrepSourceMode({
    documentId: prepSource.document_id,
    documentBoundary: sourceBoundaryMode,
  });

  let source;
  let sourceTrace: SourceTrace | null = null;
  // Öğretmen motoru: dersin belgesi ve konunun kendi sayfaları.
  let lessonCoreDocumentId: string | null = null;
  let lessonCorePages: number[] = [];
  // Belgesiz hazırlık dersi: öğretmen motoru doğruluk kuralıyla yazar.
  let lessonTopicOnly = false;
  // Sözlü "Tüm sınav": soru i → konu (K1..KN boyunca eşit aralık).
  let oralAllPlan: string[] = [];
  try {
    const mappedPages = topicWiden ? undefined : sessionMeta?.sourcePages;
    const pageDocumentIds = [
      topicDocumentId,
      prepSource.document_id as string | null,
      ...prepDocs,
    ];
    const sourceQuery = `${prep.title ?? ""} ${topicLabel} ${sessionMeta?.objective ?? ""}`.trim();

    /*
      Belgesiz hazırlık ("Belgem yok, konudan çalışayım"). Çözücü belge
      listesi boşken her zaman "no_prep_documents" dönüyor; ders bu yüzden
      HİÇ üretilmiyordu (29 Eylül 2026, canlıda "Bu hazırlığa bağlı okunabilir
      belge bulunamadı"). Oysa aşağıdaki üretim çağrısı bu hâli bekliyor:
      kaynak şartı kapalı, yerine konu çiti (topicFence) veriliyor — tanışma
      testi ve eski ders ucu da aynı yoldan çalışıyor. Belgesiz derste
      kaynak aranmaz (prep-source.ts), boş bağlamla konu çitine geçilir.
    */
    const hasPrepDocuments =
      Boolean(topicDocumentId) ||
      prepDocs.length > 0 ||
      prepSourceDocumentIds({
        documentId: prepSource.document_id as string | null,
        sourceDocumentIds: prepSource.source_document_ids as string[] | null,
      }).length > 0;
    const topicOnlyLesson =
      kind === "lesson" && teachingV2 && !voiceSession && sourceMode === "topic_only" && !hasPrepDocuments;

    if (topicOnlyLesson) {
      lessonTopicOnly = true;
      source = EMPTY_SOURCE_CONTEXT;
    } else if (kind === "lesson" && teachingV2 && !voiceSession) {
      lessonCoreDocumentId = topicDocumentId ?? (prepSource.document_id as string | null) ?? prepDocs[0] ?? null;
      // Ders: birleşik çözücü. Sonraki adım önceki kaynağı silemez.
      const resolved = await resolveLessonSource(service, {
        userId,
        prepId,
        topicId: topic?.id ?? null,
        topicLabel,
        sessionMeta,
        prepDocs,
        primaryDocumentId: (prepSource.document_id as string | null) ?? null,
        topicDocumentId,
        topicNodeId,
        sourceRefs: topicSourceRefs,
        sourceDocumentIds: prepSource.source_document_ids,
        sourceBoundaryMode,
        query: sourceQuery,
      });
      sourceTrace = resolved.trace;
      // Öğretmen motoru dersi yalnız konunun kendi sayfalarından yazar;
      // aşağıdaki zenginleştirmenin belgenin başka yerlerinden eklediği
      // parçalar (KPSS dersi s.5'ten s.28'e dağılmıştı) motora gitmez.
      lessonCorePages =
        !topicWiden && sessionMeta?.sourcePages?.length
          ? sessionMeta.sourcePages
          : pagesMarkedInSource(resolved.context?.block ?? "");
      if (resolved.unavailable) {
        console.error("node_source_unavailable", {
          kind,
          requestId: parsed.data.clientRequestId ?? null,
          topic: topicLabel,
          reason: resolved.unavailable,
          trace: resolved.trace,
        });
        await recordLessonGenerationFailure(service, {
          userId,
          prepId,
          topicId: topic?.id ?? null,
          topicLabel,
          kind,
          stage: "source",
          reason: resolved.unavailable,
          reasons: resolved.trace.steps
            .filter((step) => !step.ok)
            .map((step) => `${step.step}:${step.detail ?? "fail"}`)
            .slice(0, 8),
          sourceTrace: resolved.trace,
        });
        return errorResponse(503, "source_unavailable", {
          reason: resolved.unavailable,
          refunded: false,
        });
      }
      // Zenginleştirme ölümcül değil — related parçalar eklenir (#118, sayfa yolu dahil).
      source = shouldSearchSources(sourceMode)
        ? await enrichLessonSource(
            service,
            userId,
            resolved.context,
            sourceQuery,
            prepDocs,
          )
        : resolved.context;
    } else if (
      kind === "oral" &&
      (parsed.data.oralScope === "all" || oralMultiTopic) &&
      !voiceSession &&
      hasPrepDocuments
    ) {
      // Birden çok konu seçildiyse (30 Ekim 2026) "Tüm sınav"ın dengeli kaynağı yalnız o konulardan.
      const balanced = await loadOralAllSource(service, {
        userId,
        prepId,
        count: oralCount ?? 5,
        fallbackDocumentIds: pageDocumentIds,
        sourceBoundaryMode,
        onlyTopicIds: oralMultiTopic ? oralTopicIds : null,
      });
      oralAllPlan = balanced.plan;
      source = balanced.source.block.trim()
        ? balanced.source
        : await loadSourceContext(service, userId, sourceQuery, {
            documentId: prepSource?.document_id ?? null,
            sourceBoundaryMode: teachingV2 ? sourceBoundaryMode : null,
            limit: 12,
          });
    } else {
      let pageSource =
        teachingV2 && !voiceSession
          ? await loadPageSourceAcrossDocuments(
              service,
              userId,
              pageDocumentIds,
              mappedPages,
              { sourceBoundaryMode, topicLabel, mode: "strict" },
            )
          : EMPTY_SOURCE_CONTEXT;
      if (
        teachingV2 &&
        !voiceSession &&
        prepSource.document_id &&
        mappedPages?.length &&
        pageSource.block.trim()
      ) {
        const widened = await widenSourcePages(
          service,
          prepSource.document_id as string,
          topicLabel,
          mappedPages,
          pageSource.block,
        );
        if (widened.some((page) => !mappedPages.includes(page))) {
          pageSource = await loadPageSourceContext(
            service,
            userId,
            prepSource.document_id,
            widened,
            { sourceBoundaryMode, topicLabel },
          );
        }
      }
      source = pageSource.block
        ? pageSource
        : voiceSession || !shouldSearchSources(sourceMode)
          ? EMPTY_SOURCE_CONTEXT
          : await loadSourceContext(
              service,
              userId,
              sourceQuery,
              {
                documentId: prepSource?.document_id ?? null,
                sourceBoundaryMode: teachingV2 ? sourceMode : null,
              },
            );
    }
  } catch {
    const reason: SourceUnavailableReason = "search_error";
    console.error("node_source_unavailable", {
      kind,
      requestId: parsed.data.clientRequestId ?? null,
      topic: topicLabel,
      reason,
      trace: sourceTrace,
    });
    await recordLessonGenerationFailure(service, {
      userId,
      prepId,
      topicId: topic?.id ?? null,
      topicLabel,
      kind,
      stage: "source",
      reason,
      reasons: ["exception"],
      sourceTrace: sourceTrace ?? undefined,
    });
    return errorResponse(503, "source_unavailable", {
      reason,
      refunded: false,
    });
  }

  // Öğretmen test motoru: konu testi de konunun kendi sayfalarından yazılır;
  // belgesiz hazırlıkta konunun yerleşik bilgisinden.
  if (TEACHER_PAGE_KINDS.has(kind) && teachingV2 && !voiceSession && !lessonCoreDocumentId) {
    const documentId = topicDocumentId ?? (prepSource.document_id as string | null) ?? prepDocs[0] ?? null;
    if (documentId) {
      lessonCoreDocumentId = documentId;
      if (!topicWiden && sessionMeta?.sourcePages?.length) {
        lessonCorePages = sessionMeta.sourcePages;
      } else {
        // Sayfa listesi yoksa dersin çözücüsü: test ve podcast dersle aynı
        // sayfalardan yazılsın (KPSS test düğümlerinde sourcePages boştu).
        const resolved = await resolveLessonSource(service, {
          userId,
          prepId,
          topicId: topic?.id ?? null,
          topicLabel,
          sessionMeta,
          prepDocs,
          primaryDocumentId: (prepSource.document_id as string | null) ?? null,
          topicDocumentId,
          topicNodeId,
          sourceRefs: topicSourceRefs,
          sourceDocumentIds: prepSource.source_document_ids,
          sourceBoundaryMode,
          query: `${prep.title ?? ""} ${topicLabel} ${sessionMeta?.objective ?? ""}`.trim(),
        }).catch(() => null);
        const lessonPages = pagesMarkedInSource(resolved?.context?.block ?? "");
        lessonCorePages = lessonPages.length ? lessonPages : pagesMarkedInSource(source.block);
      }
    } else if (sourceMode === "topic_only") {
      lessonTopicOnly = true;
    }
  }

  // Podcast, sayfa kaynağı duruyorsa hazırlıktaki diğer belgelere de bakar.
  // Sayfa listesi okunamadıysa buraya gelinmez; o durumda arama yedeği yok.
  let podcastSyllabus = "";
  if (kind === "podcast" && teachingV2 && !voiceSession && source.block.trim()) {
    const corpus = await loadPodcastCorpus(service, userId, prepId, topicLabel);
    podcastSyllabus = corpus.syllabus;
    source = { ...source, block: mergePodcastSource(source.block, corpus.excerpts) };
  }

  // v2 + bound document: empty source must fail closed (no silent general-knowledge fill).
  if (
    teachingV2 &&
    !voiceSession &&
    prepSource.document_id &&
    !source.block.trim()
  ) {
    const reason: SourceUnavailableReason = "search_no_match";
    console.error("node_source_unavailable", {
      kind,
      requestId: parsed.data.clientRequestId ?? null,
      topic: topicLabel,
      reason,
      trace: sourceTrace,
    });
    await recordLessonGenerationFailure(service, {
      userId,
      prepId,
      topicId: topic?.id ?? null,
      topicLabel,
      kind,
      stage: "source",
      reason,
      reasons: ["empty_block"],
      sourceTrace: sourceTrace ?? undefined,
    });
    return errorResponse(503, "source_unavailable", {
      reason,
      refunded: false,
    });
  }

  // Stage 8: reserve a creating row + stable credit key before model work.
  let generationId: string | undefined;
  let creatingAttemptId: string | undefined;
  let creditKey: string | undefined;

  // Önceden yazım öğrenci kaydı açmaz ve kredi ayırmaz; düğümü sahiplenir.
  if (prefetch) {
    const claimed = await claimPrefetchSlot(service, {
      nodeId,
      prepId,
      userId,
      topicId: topic?.id ?? null,
      familiarity,
    });
    if (!claimed) return NextResponse.json({ ok: true, skipped: "busy" });
    if (kind === "quiz") await tagQuizPrefetchClaim(service, { nodeId, variant });
  }

  if (teachingV2 && !prefetch) {
    if (!clientRequestId) {
      clientRequestId = crypto.randomUUID();
    }
    generationId = crypto.randomUUID();
    creditKey = creditIdempotencyKeyForStart({
      userId,
      nodeId,
      clientRequestId,
    });

    if (existingForKey?.status === "creating") {
      creatingAttemptId = existingForKey.id;
      let claim = service
        .from("exam_prep_node_attempts")
        .update({
          status: "creating",
          generation_id: generationId,
          updated_at: new Date().toISOString(),
          familiarity,
          mood,
          difficulty,
          voice_mode: voiceMode,
        })
        .eq("id", existingForKey.id)
        .eq("status", "creating");
      claim = existingForKey.updated_at
        ? claim.eq("updated_at", existingForKey.updated_at)
        : claim.is("updated_at", null);
      const { data: claimed, error: claimError } = await claim.select("id").maybeSingle();
      if (claimError || !claimed) return errorResponse(409, "generation_in_progress");
    } else {
      const creatingRow = {
        node_id: nodeId,
        exam_prep_id: prepId,
        user_id: userId,
        topic_id: topic?.id ?? null,
        difficulty,
        voice_mode: voiceMode,
        payload: null,
        total: 1,
        status: "creating",
        generation_id: generationId,
        client_request_id: clientRequestId,
        familiarity,
        mood,
        content_version: 1,
        updated_at: new Date().toISOString(),
      };
      let { data: created, error: createErr } = await service
        .from("exam_prep_node_attempts")
        .insert(creatingRow)
        .select("id, generation_id")
        .single();
      if (createErr) {
        // Unique client_request_id race: re-read and return if ready.
        const raced = await findAttemptByClientRequest(service, {
          userId,
          nodeId,
          clientRequestId,
        });
        if (raced?.payload) {
          return NextResponse.json(
            attemptStartResponse(raced, {
              kind,
              title,
              topicLabel,
              publicPayload: await publicPayloadForUser(service, userId, raced.payload as Record<string, unknown>, lessonReviewCards, kind, prepLanguage(prep.learning_preferences), lessonFormat),
              resumed: true,
            }),
          );
        }
        if (raced) return errorResponse(409, "generation_in_progress");
        ({ data: created, error: createErr } = await service
          .from("exam_prep_node_attempts")
          .insert({
            node_id: nodeId,
            exam_prep_id: prepId,
            user_id: userId,
            topic_id: topic?.id ?? null,
            difficulty,
            voice_mode: voiceMode,
            payload: null,
            total: 1,
            status: "creating",
            generation_id: generationId,
            client_request_id: clientRequestId,
            content_version: 1,
            updated_at: new Date().toISOString(),
          })
          .select("id, generation_id")
          .single());
      }
      if (createErr || !created) return errorResponse(500, "generation_failed");
      creatingAttemptId = created.id;
      generationId = created.generation_id ?? generationId;
    }

    await upsertGenerationJob(service, {
      userId,
      prepId,
      nodeId,
      attemptId: creatingAttemptId!,
      clientRequestId,
      generationId: generationId!,
      status: "creating",
    });
  }

  const upcomingTopics =
    !voiceSession && kind === "lesson"
      ? await loadUpcomingTopicTitles(service, prepId, topicLabel)
      : null;

  // Parça parça açılış (18 Ekim 2026, ürün sahibinin kararı): ilk denetlenmiş kavram kayda
  // yazılınca öğrenciye dönülür; kalan kavramlar arka planda (`after`) aynı kayda eklenir.
  // Öğrencinin cevap kaydı ayrı alanlara yazıyor (answers, content_version); yalnız payload değişir.
  const streamQuiz =
    kind === "quiz" &&
    teachingV2 &&
    !prefetch &&
    !voiceSession &&
    Boolean(creatingAttemptId && generationId);
  const progressive =
    (kind === "lesson" &&
      teachingV2 &&
      !prefetch &&
      !voiceSession &&
      parsed.data.lessonStream === true &&
      Boolean(creatingAttemptId && generationId && clientRequestId)) ||
    streamQuiz;
  let shownFirst = false;
  let announceFirst: (payload: Record<string, unknown>) => void = () => undefined;
  const firstShown = new Promise<Record<string, unknown>>((resolve) => (announceFirst = resolve));
  const publishLesson = async (partial: Record<string, unknown>) => {
    const next = buildingPayload(partial);
    const { error: publishError } = await service
      .from("exam_prep_node_attempts")
      .update({ payload: next, status: "active", updated_at: new Date().toISOString() })
      .eq("id", creatingAttemptId!)
      .eq("generation_id", generationId!)
      .in("status", ["creating", "active"]);
    if (publishError) {
      console.error("lesson_publish_failed", { nodeId, cause: publishError.message.slice(0, 160) });
      return;
    }
    if (!shownFirst) {
      shownFirst = true;
      firstPublishedMs = Date.now() - requestStarted;
      announceFirst(next);
    }
  };

  // Konunun yardımcı kaynakları (defter, test, kart fotoğrafı; 19 Ekim 2026). Model çağrısı yok;
  // okuma düşerse boş döner ve ders kendi sayfalarıyla yazılır.
  const teacherCore =
    (kind === "lesson" || TEACHER_PAGE_KINDS.has(kind)) && lessonCoreDocumentId && lessonCorePages.length && !voiceSession;
  const lessonSupport = teacherCore
    ? loadTopicSupport(service, { userId, prepId, topicId: topic?.id ?? null })
    : Promise.resolve([]);

  generationLaunchedMs = Date.now() - requestStarted;
  // Podcast'in dinleme kontrolü yayımdan sonra (30 Ekim 2026): kayıt yazılınca `fillPodcastCheckLater` doldurur.
  let podcastCheckTask: (() => Promise<QuizQuestion[]>) | null = null;
  const schedulePodcastCheck = (attemptId: string) => {
    const task = podcastCheckTask;
    if (task) after(() => fillPodcastCheckLater(service, { attemptId, prepId, userId, topicLabel, task }));
  };
  const generation: Promise<Record<string, unknown>> = (async () =>
    voiceSession
      ? { type: "voice" }
      : await generateNodePayload({
          service,
          userId,
          isPremium: premium,
          freeMeter,
          requestStartedAt: requestStarted,
          onLessonPublish: progressive
            ? publishLesson
            : prefetch
              ? (partial: Record<string, unknown>) => publishPrefetchPartial(service, nodeId, partial)
              : undefined,
          kind,
          prepTitle: prep.title ?? "Hazırlık",
          topicLabel,
          difficulty: teachingV2
            ? contentDifficultyLine({
                requested: difficulty,
                familiarity,
                focusTopic: (Array.isArray(prep.hard_topics_self)
                  ? (prep.hard_topics_self as string[])
                  : []
                ).some(
                  (label) =>
                    label.trim().toLocaleLowerCase("tr") ===
                    topicLabel.trim().toLocaleLowerCase("tr"),
                ),
                measuredLevel:
                  (topic as { measured_level?: string | null } | null)
                    ?.measured_level ?? null,
              })
            : difficulty,
          requestedDifficulty: difficulty,
          familiarity,
          // Ruh hali yalnız kaydedilir (18 Ekim 2026, ürün sahibinin kararı): önceden yazılan içerik
          // ona göre değişemez, açılışta yazılan da değişmesin. Sözlüde bu alan öğretmen tipini taşır.
          mood: kind === "oral" ? mood : DEFAULT_MOOD,
          sourceBlock: source.block,
          lessonCore:
            teacherCore && lessonCoreDocumentId
              ? {
                  documentId: lessonCoreDocumentId,
                  pages: lessonCorePages,
                  support: supportPagesForEngine(await lessonSupport),
                }
              : null,
          lessonTopicOnly,
          repetitiveSparseEvidence: source.repetitiveSparseEvidence,
          sourceFormulas: source.formulas ?? [],
          teachingV2,
          sessionMeta: sessionMeta
            ? {
                ...sessionMeta,
                sourcePages: [
                  ...new Set([
                    ...(topicWiden ? [] : (sessionMeta.sourcePages ?? [])),
                    ...pagesMarkedInSource(source.block),
                  ]),
                ],
              }
            : sessionMeta,
          requireSourceSupport: Boolean(teachingV2 && sourceMode === "documents_only"),
          topicFenceBlock:
            sourceMode === "topic_only"
              ? topicFence({
                  topic: topicLabel,
                  examTitle: prep.title,
                  examType: prep.exam_type,
                })
              : "",
          idempotencyKey: creditKey,
          charge: !prefetch,
          warm,
          firstLesson: prefetch && parsed.data.firstLesson === true,
          nodeId,
          nodeTitle: (node.title as string | null) ?? null,
          // Dersin bölümleri kaynağın kendi alt başlıkları olsun.
          sectionBackbone:
            kind === "lesson" && teachingV2
              ? (
                  await loadSectionBackbone(service, {
                    documentId: prepSource.document_id,
                    pageNumbers: topicWiden ? undefined : sessionMeta?.sourcePages,
                  })
                ).filter((heading) => {
                  const title = heading.replace(/^\s*\d+(?:\.\d+)*\.?\s+/, "").trim().toLocaleLowerCase("tr");
                  return title.length >= 3 && source.block.toLocaleLowerCase("tr").includes(title);
                })
              : [],
          learningPreferences: teachingV2 ? prep.learning_preferences : null,
          teacherBrief: teachingV2 ? teachingPlan.brief : "",
          // "Öğretmen gözü" (18 Ekim 2026): bütün öğretmen motorları aynı maddeleri okur.
          examPoints: teachingV2 ? teachingPlan.examPoints : [],
          teachingPriority: teachingV2 ? teachingPlan.priority : null,
          upcomingTopics,
          lessonContent:
            kind === "podcast" && teachingV2 && topic?.id
              ? await loadTopicLesson(service, topic.id)
              : null,
          lessonQuiz: quizLesson,
          onLessonSaved: refreshTopicQuiz,
          onPodcastCheckLater: (task) => {
            podcastCheckTask = task;
          },
          prepId,
          topicId: topic?.id ?? null,
          practiceTopics,
          finalFill,
          oralQuestionCount: kind === "oral" ? oralCount : undefined,
          oralCitation:
            kind === "oral"
              ? {
                  file: source.documentName,
                  pages: (topicWiden ? [] : (sessionMeta?.sourcePages ?? [])).length
                    ? sessionMeta?.sourcePages ?? []
                    : [
                        ...new Set([
                          ...pagesMarkedInSource(source.block),
                          ...source.matches
                            .map((match) => match.pageNumber)
                            .filter((page): page is number => typeof page === "number"),
                        ]),
                      ],
                }
              : null,
          syllabusLine:
            kind === "oral"
              ? [syllabusWeightLineFromChecklist(teachingPlan.checklist), oralPlanBrief(oralAllPlan)].filter(Boolean).join("\n")
              : "",
          podcastLength: parsePodcastLength(parsed.data.podcastLength),
          requestId: clientRequestId ?? parsed.data.clientRequestId ?? null,
          grounding:
            kind === "podcast" && teachingV2
              ? [
                  await podcastScopeBrief(service, prepDocs, topicLabel, teachingPlan.priority),
                  podcastSyllabus,
                ]
                  .filter(Boolean)
                  .join("\n")
              : "",
        }))();
  // Sonuç aşağıda okunur; erken red işlenmemiş sayılmasın.
  generation.catch(() => undefined);

  const settle = async (): Promise<NextResponse> => {
  let payload: Record<string, unknown>;
  try {
    payload = await generation;
  } catch (error) {
    const code = error instanceof NodeGenerationError ? error.code : "generation_failed";
    const status = error instanceof NodeGenerationError ? error.status : 502;
    const reasons = error instanceof NodeGenerationError ? error.reasons.slice(0, 6) : [];
    if (shownFirst && creatingAttemptId && generationId) {
      if (kind === "quiz") {
        await service
          .from("exam_prep_node_attempts")
          .update({
            status: "failed",
            payload: { type: "quiz", questions: [], generationFailed: true },
            updated_at: new Date().toISOString(),
          })
          .eq("id", creatingAttemptId)
          .eq("generation_id", generationId);
        await recordLessonGenerationFailure(service, {
          userId,
          prepId,
          topicId: topic?.id ?? null,
          topicLabel,
          kind,
          stage: "generation",
          reason: code,
          reasons: ["yayımlanmış test söz verilen sayıya varmadan kapandı", ...reasons],
        });
        return errorResponse(status, code, { refunded: true });
      }
      // Öğrenci dersin baş kısmını okuyor: kayıt başarısız sayılmaz, ders olduğu kadarıyla kapanır.
      const { data: current } = await service
        .from("exam_prep_node_attempts")
        .select("payload")
        .eq("id", creatingAttemptId)
        .maybeSingle();
      if (current?.payload && typeof current.payload === "object") {
        await service
          .from("exam_prep_node_attempts")
          .update({ payload: truncatedPayload(current.payload as Record<string, unknown>) })
          .eq("id", creatingAttemptId)
          .eq("generation_id", generationId);
      }
      await recordLessonGenerationFailure(service, {
        userId,
        prepId,
        topicId: topic?.id ?? null,
        topicLabel,
        kind,
        stage: "generation",
        reason: code,
        reasons: ["yayımlanmış ders olduğu kadarıyla kapandı", ...reasons],
      });
      return errorResponse(status, code, { refunded: true });
    }
    // generateJson deferCommit başarısızlığında rezervasyon iade edilir.
    // commitCredits sonrası hatalar generateNodePayload içinde yutulur.
    const refunded = code !== "source_unavailable";
    console.error("node_generation_failed", {
      kind,
      requestId: clientRequestId ?? parsed.data.clientRequestId ?? null,
      code,
      status,
      reasons,
      refunded,
    });
    await recordLessonGenerationFailure(service, {
      userId,
      prepId,
      topicId: topic?.id ?? null,
      topicLabel,
      kind,
      stage: code === "content_verification_failed" ? "verification" : "generation",
      reason: code,
      reasons,
      sourceTrace: sourceTrace ?? undefined,
    });
    if (teachingV2 && creatingAttemptId && generationId && clientRequestId) {
      await service
        .from("exam_prep_node_attempts")
        .update({
          status: "failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", creatingAttemptId)
        .eq("generation_id", generationId);
      await upsertGenerationJob(service, {
        userId,
        prepId,
        nodeId,
        attemptId: creatingAttemptId,
        clientRequestId,
        generationId,
        status: "failed",
        errorCode: code,
      });
    }
    if (prefetch) {
      const adopted = await adoptedPrefetchAttempt(service, nodeId).catch(() => null);
      if (adopted) {
        const { data: current } = await service
          .from("exam_prep_node_attempts")
          .select("payload")
          .eq("id", adopted.id)
          .maybeSingle();
        if (current?.payload && typeof current.payload === "object") {
          await service
            .from("exam_prep_node_attempts")
            .update({ payload: truncatedPayload(current.payload as Record<string, unknown>) })
            .eq("id", adopted.id)
            .eq("generation_id", adopted.generationId);
        }
        if (adopted.clientRequestId) {
          await settlePendingStart(service, {
            userId: adopted.userId,
            key: `${creditIdempotencyKeyForStart({ userId: adopted.userId, nodeId, clientRequestId: adopted.clientRequestId })}_prefetched`,
            outcome: "refund",
          });
        }
      }
      await dropPrefetch(service, nodeId);
    }
    if (error instanceof NodeGenerationError) {
      const admin = await isAdminUser(service, userId).catch(() => false);
      return errorResponse(error.status, error.code, {
        refunded,
        ...(admin && reasons.length ? { reasons } : {}),
      });
    }
    return errorResponse(502, "generation_failed", { refunded: true });
  }

  // Zayıf konuya yönelen düğümün içeriği o konunun adını taşır (20 Ekim 2026): bitişteki kanıt ve
  // yanılgı devralınan konuya değil sorulan konuya yazılır.
  if (retargetedTopic && typeof payload.testedTopic !== "string") payload = { ...payload, testedTopic: retargetedTopic };
  // Sözlü "Tüm sınav" (30 Ekim 2026, Paket I #8): sorular birden çok konudan, soru başına konu yok. Kanıt ve
  // yanılgı tek bir konuya (birleşik etiket ya da düğümün konusu) yazılmaz; içerik bütün sınavı kapsadığını taşır.
  // Birden çok konu seçilen sözlü de (30 Ekim 2026) aynı: `scope: "topics"` (`contentSpansTopics`); önceden birleşik ad
  // ("A, B") kanıt anahtarı oluyor, hiçbir konuya bağlanmayan bir hâkimiyet satırı açılıyordu.
  if (kind === "oral" && (parsed.data.oralScope === "all" || oralMultiTopic) && payload.type === "oral") {
    const { testedTopic: _joined, ...rest } = payload as Record<string, unknown>;
    void _joined;
    payload = { ...rest, scope: parsed.data.oralScope === "all" ? "all" : "topics" };
  }
  // Kartlar öğrencinin göreceği listeyle kayda geçer (`freezeShownCards`, 30 Ekim 2026): not ve sonuç aynı kartları sayar.
  payload = freezeShownCards(payload, lessonReviewCards);

  const total = countTotal(kind, payload);

  // Öğrenciye yazılan süre içerikten (25 Ekim 2026, P1-7): yol kartı ve kapı `activityMinutes`'ı okur; takvimin
  // `durationMinutes` bütçesi değişmez (haftalık tempo onu sayar).
  {
    const activityMinutes = activityDurationMinutes(kind, {
      readingMinutes:
        payload.type === "lesson" && payload.lesson && typeof payload.lesson === "object"
          ? honestReadingMinutes(readLessonV2(payload.lesson) ?? { sections: [] })
          : null,
      itemCount: payload.type === "lesson" || payload.type === "podcast" ? null : total,
      minutes: payload.type === "podcast" ? podcastLengthSpec(parsePodcastLength(payload.length)).minutes : null,
    });
    const meta =
      node.session_meta && typeof node.session_meta === "object" && !Array.isArray(node.session_meta)
        ? { ...(node.session_meta as Record<string, unknown>) }
        : {};
    const namedTitle =
      (kind === "gaps" || kind === "focused") && practiceTopics?.length
        ? weakPracticeTitle(kind, practiceTopics.slice(0, 1))
        : null;
    if (namedTitle) title = namedTitle;
    const namedTopic = retargetedTopic || (namedTitle ? practiceTopics?.[0] ?? null : null);
    const nextMeta = {
      ...meta,
      activityMinutes,
      ...(namedTopic ? { topicTitle: namedTopic } : {}),
    };
    const patch: { session_meta?: Record<string, unknown>; title?: string } = {};
    if (meta.activityMinutes !== activityMinutes || (namedTopic && meta.topicTitle !== namedTopic)) {
      patch.session_meta = nextMeta;
    }
    if (namedTitle && node.title !== namedTitle) patch.title = namedTitle;
    if (patch.session_meta || patch.title) {
      await service.from("exam_prep_nodes").update(patch).eq("id", nodeId).then(undefined, () => undefined);
    }
  }

  if (prefetch) {
    const adopted = await adoptedPrefetchAttempt(service, nodeId);
    if (adopted) {
      await service
        .from("exam_prep_node_attempts")
        .update({ payload, updated_at: new Date().toISOString() })
        .eq("id", adopted.id)
        .eq("generation_id", adopted.generationId);
      if (adopted.clientRequestId) {
        await settlePendingStart(service, {
          userId: adopted.userId,
          key: `${creditIdempotencyKeyForStart({ userId: adopted.userId, nodeId, clientRequestId: adopted.clientRequestId })}_prefetched`,
          outcome: "commit",
        });
      }
      await dropPrefetch(service, nodeId);
      const topicId = topic?.id ?? null;
      if (topicId) await saveTopicLesson(service, { prepId, topicId, payload });
      refreshTopicQuiz(topicId);
      console.info("lesson_prefetch_adopted_done", { nodeId });
      return NextResponse.json({ ok: true, prefetched: "adopted" });
    }
    // Test yazılırken konunun dersi kaydedildiyse (ya da satırı başka yazım aldıysa) saklanmaz.
    if (
      kind === "quiz" &&
      topic?.id &&
      !(await quizPrefetchStorable(service, {
        origin: options.origin,
        userId,
        prepId,
        node: { id: node.id as string, kind: node.kind as string, status: (node.status as string | null) ?? null, session_meta: node.session_meta },
        topicId: topic.id,
        variant,
        lessonKey: quizLesson?.key ?? null,
      }))
    ) {
      return NextResponse.json({ ok: true, prefetched: false });
    }
    const stored = await storePrefetchedLesson(service, nodeId, { ...payload, prefetchVariant: variant }, { warm });
    console.info("prefetch_ready", { nodeId, kind, stored });
    return NextResponse.json({ ok: true, prefetched: stored });
  }

  if (teachingV2 && creatingAttemptId && generationId && clientRequestId) {
    const { data: readyAttempt, error: readyErr } = await service
      .from("exam_prep_node_attempts")
      .update({
        payload,
        total,
        status: "active",
        updated_at: new Date().toISOString(),
        ...(kind === "written_exam" ? writtenExamDeadline() : {}),
      })
      .eq("id", creatingAttemptId)
      .eq("generation_id", generationId)
      // Parça parça açılan ders ilk kavramla "active" oldu.
      .in("status", shownFirst ? ["creating", "active"] : ["creating"])
      .select(
        "id, status, payload, answers, answer_meta, score, total, generation_id, client_request_id, complete_request_id, content_version, updated_at, difficulty, voice_mode, started_at, expires_at",
      )
      .maybeSingle();

    if (readyErr || !readyAttempt) {
      // Newer generation won the race — do not overwrite.
      return errorResponse(409, "stale_generation");
    }

    await upsertGenerationJob(service, {
      userId,
      prepId,
      nodeId,
      attemptId: creatingAttemptId,
      clientRequestId,
      generationId,
      status: "ready",
    });
    schedulePodcastCheck(creatingAttemptId);

    if (topic?.id) {
      await service
        .from("exam_prep_topics")
        .update({ familiarity })
        .eq("id", topic.id);
    }
    await service.from("study_session_moods").insert({
      user_id: userId,
      exam_prep_id: prepId,
      node_id: nodeId,
      mood,
    });

    if (node.status !== "done") {
      await service.from("exam_prep_nodes").update({ status: "ready" }).eq("id", nodeId);
    }

    return NextResponse.json({
      ...attemptStartResponse(readyAttempt, {
        kind,
        title,
        topicLabel,
        publicPayload: await publicPayloadForUser(service, userId, payload, lessonReviewCards, kind, prepLanguage(prep.learning_preferences), lessonFormat),
        resumed: false,
      }),
      ...(await readWalletBalance(service, userId)),
    });
  }

  const baseAttempt = {
    node_id: nodeId,
    exam_prep_id: prepId,
    user_id: userId,
    topic_id: topic?.id ?? null,
    difficulty,
    voice_mode: voiceMode,
    payload,
    total,
    status: "active",
    ...(kind === "written_exam" ? writtenExamDeadline() : {}),
  };

  let { data: attempt, error } = await service
    .from("exam_prep_node_attempts")
    .insert({ ...baseAttempt, familiarity, mood })
    .select("id")
    .single();

  // Kalibrasyon kolonları migration ile geliyor. Kod migration'dan önce
  // dağıtılırsa ders üretimi tamamen kırılmasın diye sinyalsiz tekrar denenir.
  if (error) {
    ({ data: attempt, error } = await service
      .from("exam_prep_node_attempts")
      .insert(baseAttempt)
      .select("id")
      .single());
  }

  if (error || !attempt) return errorResponse(500, "generation_failed");
  schedulePodcastCheck(attempt.id as string);

  // Aşinalık konuya yazılır ki sonraki derste varsayılan olarak gelsin;
  // ruh hali zaman içinde desen çıkarmak için ayrı tabloda birikir.
  // İkisi de yan etki: başarısız olurlarsa dersi engellemezler.
  if (topic?.id) {
    await service
      .from("exam_prep_topics")
      .update({ familiarity })
      .eq("id", topic.id);
  }
  await service.from("study_session_moods").insert({
    user_id: userId,
    exam_prep_id: prepId,
    node_id: nodeId,
    mood,
  });

  if (node.status !== "done") {
    await service.from("exam_prep_nodes").update({ status: "ready" }).eq("id", nodeId);
  }

  return NextResponse.json({
    ok: true,
    attemptId: attempt.id,
    kind,
    title,
    topicLabel,
    voiceMode,
    payload: await publicPayloadForUser(service, userId, payload, lessonReviewCards, kind, prepLanguage(prep.learning_preferences), lessonFormat),
    ...(await readWalletBalance(service, userId)),
  });
  };
  let settling: Promise<NextResponse> | null = null;
  const settleOnce = () => (settling ??= settle());

  if (progressive) {
    const first = await Promise.race([
      firstShown.then((partial) => ({ shown: true as const, partial })),
      generation.then(
        () => ({ shown: false as const }),
        () => ({ shown: false as const }),
      ),
    ]);
    if (first.shown) {
      // Kalan kavramlar, kapanış ve yan kayıtlar yanıttan sonra, aynı fonksiyonda.
      after(() =>
        settleOnce().then(undefined, (error: unknown) => {
          console.error("lesson_build_settle_failed", {
            nodeId,
            cause: error instanceof Error ? error.message.slice(0, 160) : "unknown",
          });
        }),
      );
      const { data: activeAttempt } = await service
        .from("exam_prep_node_attempts")
        .select(
          "id, status, payload, answers, answer_meta, score, total, generation_id, client_request_id, complete_request_id, content_version, updated_at, difficulty, voice_mode, started_at, expires_at",
        )
        .eq("id", creatingAttemptId!)
        .maybeSingle();
      if (activeAttempt) {
        console.info("lesson_first_shown", {
          nodeId,
          // ms, istek başından: önceden yazım bekleme · motor başlangıcı · ilk yayın · yanıt
          peekBuildingMs,
          generationLaunchedMs,
          firstPublishedMs,
          respondedMs: Date.now() - requestStarted,
        });
        { const ms = Date.now() - requestStarted; after(() => recordOpenTiming(service, { userId, kind, path: "cold", ms })); }
        return NextResponse.json({
          ...attemptStartResponse(activeAttempt, {
            kind,
            title,
            topicLabel,
            publicPayload: await publicPayloadForUser(service, userId, first.partial, lessonReviewCards, kind, prepLanguage(prep.learning_preferences), lessonFormat),
            resumed: false,
          }),
          ...(await readWalletBalance(service, userId)),
        });
      }
    }
  }
  return settleOnce();
}
