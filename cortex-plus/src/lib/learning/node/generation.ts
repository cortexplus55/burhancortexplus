/**
 * Üretim ve kapanış: türün motoru (`generateNodePayload`), parça parça açılış (ders, konu testi), hata yolu (kayıt
 * başarısız, iade), önceden yazımın saklanması ya da devralınan kayda yazılması, kaydın açılması.
 */
import "server-only";
import { NextResponse, after } from "next/server";
import { recordOpenTiming } from "@/lib/admin/beta-metrics";
import { adoptedPrefetchAttempt, dropPrefetch, publishPrefetchPartial, storePrefetchedLesson } from "@/lib/learning/lesson-prefetch";
import { quizPrefetchStorable } from "@/lib/learning/topic-test-prefetch";
import { loadTopicSupport, supportPagesForEngine } from "@/lib/learning/topic-support-load";
import { fillPodcastCheckLater } from "@/lib/learning/podcast-check-later";
import { errorResponse } from "@/lib/api/guards";
import { pagesMarkedInSource } from "@/lib/learning/source-context";
import { oralPlanBrief } from "@/lib/learning/oral-scope";
import { recordLessonGenerationFailure } from "@/lib/learning/lesson-generation-failures";
import { topicFence } from "@/lib/learning/prep-source";
import { weakPracticeTitle } from "@/lib/learning/exam-prep-plan";
import { syllabusWeightLineFromChecklist } from "@/lib/learning/oral-exam";
import { DEFAULT_MOOD, contentDifficultyLine } from "@/lib/learning/session-signals";
import type { QuizQuestion } from "@/lib/learning/exam-quiz";
import { freezeShownCards } from "@/lib/learning/teaching-standards";
import { readLessonV2 } from "@/lib/learning/lesson-v3";
import { buildingPayload, truncatedPayload } from "@/lib/learning/lesson-build";
import { isAdminUser } from "@/lib/auth/roles";
import { honestReadingMinutes } from "@/lib/learning/lesson-coherence";
import { activityDurationMinutes } from "@/lib/learning/activity-duration";
import { podcastLengthSpec } from "@/lib/learning/podcast-formats";
import { parsePodcastLength, podcastScopeBrief } from "@/lib/learning/podcast-episode";
import { prepLanguage } from "@/lib/learning/teacher-brain";
import { creditIdempotencyKeyForStart } from "@/lib/learning/attempt-lifecycle";
import { attemptStartResponse, upsertGenerationJob, writtenExamDeadline } from "@/lib/learning/attempt-lifecycle-persist";
import { NodeGenerationError, TEACHER_PAGE_KINDS, countTotal, readWalletBalance, settlePendingStart } from "@/lib/learning/node/shared";
import { loadTopicLesson, saveTopicLesson } from "@/lib/learning/node/lesson-store";
import { loadSectionBackbone, loadUpcomingTopicTitles } from "@/lib/learning/node/lesson";
import { publicPayloadForUser } from "@/lib/learning/node/payload";
import { generateNodePayload } from "@/lib/learning/node/generate";
import type { NodeContext } from "./context";
import type { StartLocals } from "./start-types";
import type { StartSource } from "./source";
import type { StartReserved } from "./reserve";

export async function runStartGeneration(
  context: NodeContext,
  state: Pick<StartLocals, "sessionMeta" | "topic" | "topicLabel" | "topicWiden" | "title" | "warm" | "refreshTopicQuiz" | "voiceSession" | "premium" | "freeMeter" | "practiceTopics" | "finalFill" | "retargetedTopic" | "quizLesson" | "variant" | "peekBuildingMs">,
  sourced: StartSource,
  reserved: StartReserved,
) {
  const { userId, service, options, requestStarted, parsed, prepId, nodeId, lessonFormat, prefetch, teachingV2, prep, node, kind, oralCount, oralMultiTopic, difficulty, voiceMode, familiarity, mood, lessonReviewCards } = context;
  const { sessionMeta, topic, topicLabel, topicWiden, warm, refreshTopicQuiz, voiceSession, premium, freeMeter, practiceTopics, finalFill, retargetedTopic, quizLesson, variant, peekBuildingMs } = state;
  let { title } = state;
  const { prepSource, prepDocs, teachingPlan, sourceMode, source, sourceTrace, lessonCoreDocumentId, lessonCorePages, lessonTopicOnly, oralAllPlan, podcastSyllabus } = sourced;
  const { clientRequestId, generationId, creatingAttemptId, creditKey } = reserved;
  let generationLaunchedMs: number | null = null;
  let firstPublishedMs: number | null = null;

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
