/**
 * `action: "start"` (varsayılan): etkinliği açar. Sıra: önceden yazım denetimi → sıradakinin önceden yazımı →
 * aynı istek kimliği / açık kayıt → yerel oturum (odaklı pratik, son kontrol, hazır olma, boşluk, tekrar) → konu
 * yönlendirme → hak ve sayaç → tekrarla/incele → süren/hazır önceden yazım → kaynak → kayıt ve kredi → üretim.
 */
import "server-only";
import { NextResponse } from "next/server";
import { PREFETCH_KINDS, canAffordLesson, nodeHasAttempts, nodeHasOpenAttempt, prefetchVariant, requestBlockPracticePrefetch, requestNextPrefetch } from "@/lib/learning/lesson-prefetch";
import { studentOptionCount } from "@/lib/learning/student-pedagogy";
import { lessonQuizContext, loadTopicLessons, type LessonQuizContext } from "@/lib/learning/lesson-quiz-context";
import { refreshQuizPrefetchAfterLesson, topicLessonInFlight } from "@/lib/learning/topic-test-prefetch";
import { errorResponse } from "@/lib/api/guards";
import { getUserEntitlements, requireFeature } from "@/lib/billing/entitlements";
import { weakPracticeTitle } from "@/lib/learning/exam-prep-plan";
import { freeMeterRemaining, nodeFreeMeter } from "@/lib/billing/node-free-meter";
import type { FreeMeter } from "@/lib/billing/free-meters";
import { billingExempt } from "@/lib/billing/free-preview";
import { FREE_TOPIC_LIMIT_CODE, freeTopicGate } from "@/lib/billing/free-topic-gate";
import { practiceTopicKey } from "@/lib/learning/quiz-delivery";
import { prepLanguage } from "@/lib/learning/teacher-brain";
import { isCreatingStale, shouldReuseExistingStart } from "@/lib/learning/attempt-lifecycle";
import { adaptiveFocusTopic } from "@/lib/learning/path-change";
import { PREP_WIDE_TARGET_KINDS } from "@/lib/learning/prep-wide-target";
import { retargetNodeTopic } from "@/lib/learning/prep-wide-target-server";
import { attemptStartResponse, findAttemptByClientRequest, findResumableAttempt } from "@/lib/learning/attempt-lifecycle-persist";
import { actionForKind, afterResponse, readWalletBalance } from "@/lib/learning/node/shared";
import { publicPayloadForUser } from "@/lib/learning/node/payload";
import type { NodeContext } from "./context";
import { openLocalSession } from "@/lib/learning/node/local-session";
import { reopenSavedAttempt } from "@/lib/learning/node/replay";
import { adoptBuildingLesson } from "@/lib/learning/node/lesson-adopt";
import { servePrefetched } from "@/lib/learning/node/prefetched";
import { resolveStartSource } from "@/lib/learning/node/source";
import { reserveStartAttempt } from "@/lib/learning/node/reserve";
import { runStartGeneration } from "@/lib/learning/node/generation";

export async function startAction(context: NodeContext): Promise<NextResponse> {
  const { userId, service, options, parsed, prepId, nodeId, action, lessonFormat, prefetch, teachingV2, prep, node, kind, oralCount, requestedTopic, oralTopicIds, oralMultiTopic, oralSameTopic, difficulty, voiceMode, mood, lessonReviewCards } = context;
  let { sessionMeta, topic, topicDocumentId, topicNodeId, topicSourceRefs, topicLabel, topicWiden, title } = context;
  let peekBuildingMs: number | null = null;

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

  // İlk doz bedava (31 Ekim 2026, Paket J1 #3): ücretsiz hesapta 1. konu tam açık; öbür konular ve final adımları
  // Plus ekranı (kazanımlarıyla). Önceden yazım da kilitli konulara harcanmaz. Kurallar `free-topic-gate.ts`'te.
  const firstTopicLock = await freeTopicGate(service, {
    userId,
    prepId,
    nodeId,
    nodeTopicId: (node.session_meta as { topicId?: string } | null)?.topicId ?? null,
    prepWide: PREP_WIDE_TARGET_KINDS.has(kind) && !adaptiveFocusTopic(kind, node.session_meta, topicLabel),
    requestedTopicLabel: requestedTopic || null,
  }).catch(() => null);
  if (firstTopicLock) {
    if (prefetch) return NextResponse.json({ ok: true, skipped: "free_topic" });
    return NextResponse.json(
      { error: "Bu konu Plus'ta.", code: FREE_TOPIC_LIMIT_CODE, firstTopic: firstTopicLock },
      { status: 402 },
    );
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

  // Stage 8: same clientRequestId → reuse attempt (no second charge / content).
  const clientRequestId = teachingV2 ? parsed.data.clientRequestId : undefined;
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

  const local = await openLocalSession(context, { topic, clientRequestId, title, topicLabel });
  if (local instanceof Response) return local;
  let practiceTopics = local.practiceTopics;
  const finalFill = local.finalFill;
  title = local.title;
  topicLabel = local.topicLabel;

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

  const reopened = await reopenSavedAttempt(context, { topic, topicLabel, title, clientRequestId, voiceSession });
  if (reopened) return reopened;

  const adopted = await adoptBuildingLesson(context, {
    topic,
    topicLabel,
    title,
    refreshTopicQuiz,
    clientRequestId,
    voiceSession,
    freeMeter,
    peekBuildingMs,
  });
  if (adopted instanceof Response) return adopted;
  peekBuildingMs = adopted.peekBuildingMs;

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
  const served = await servePrefetched(context, {
    topic,
    topicLabel,
    title,
    refreshTopicQuiz,
    clientRequestId,
    voiceSession,
    freeMeter,
    variant,
    peekBuildingMs,
  });
  if (served) return served;

  const sourced = await resolveStartSource(context, {
    sessionMeta,
    topic,
    topicDocumentId,
    topicNodeId,
    topicSourceRefs,
    topicLabel,
    topicWiden,
    voiceSession,
  });
  if (sourced instanceof Response) return sourced;

  const reserved = await reserveStartAttempt(context, { topic, topicLabel, title, existingForKey, variant, clientRequestId });
  if (reserved instanceof Response) return reserved;

  return runStartGeneration(
    context,
    {
      sessionMeta,
      topic,
      topicLabel,
      topicWiden,
      title,
      warm,
      refreshTopicQuiz,
      voiceSession,
      premium,
      freeMeter,
      practiceTopics,
      finalFill,
      retargetedTopic,
      quizLesson,
      variant,
      peekBuildingMs,
    },
    sourced,
    reserved,
  );

}
