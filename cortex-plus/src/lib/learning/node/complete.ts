/**
 * `action: "complete"`: notlandırma, yol uyarlaması, tamamlama RPC'si, yanılgı, öğrenme izi, Yanlışlar Defteri,
 * günü gelen tekrar, yazılı deneme incelemesi ve yıldız. Sözlü hakem yanıttan sonra (`gradingAsync`).
 */
import "server-only";
import { NextResponse } from "next/server";
import { requestNextPrefetch } from "@/lib/learning/lesson-prefetch";
import { awardStars } from "@/lib/stars/award";
import { prepStarRef, prepStars } from "@/lib/stars/rules";
import { istanbulDay } from "@/lib/istanbul-day";
import { errorResponse } from "@/lib/api/guards";
import { isPremiumUser } from "@/lib/ai/generate";
import { pickPracticeNodeId, practiceHref } from "@/lib/learning/study-tools";
import { loadLevelHint } from "@/lib/learning/prep-level";
import { contentSpansTopics, contentTestedTopic } from "@/lib/learning/topic-identity";
import { gradeOralExam, oralAttemptScore, type OralExamReport, type OralQuestionDraft } from "@/lib/learning/oral-exam";
import { kindListFilter, pathSkipKinds } from "@/lib/billing/node-free-meter";
import { cardsAsShown, extractMisconceptions, freezeShownCards } from "@/lib/learning/teaching-standards";
import { prepLanguage } from "@/lib/learning/teacher-brain";
import { recordLearningTrackingAfterComplete, stripAnswerMeta } from "@/lib/learning/learning-tracking-persist";
import { recordMistakes } from "@/lib/learning/mistake-notebook";
import { scheduleReviewsAfterComplete } from "@/lib/learning/review-items-store";
import { recordUserActivity } from "@/lib/streak/record-activity";
import { mergeAnswersForScoring } from "@/lib/learning/attempt-lifecycle";
import { adaptPathAfterResult } from "@/lib/learning/adaptive-path";
import { upsertGenerationJob } from "@/lib/learning/attempt-lifecycle-persist";
import { deferTask, readWalletBalance, scheduleAfter } from "@/lib/learning/node/shared";
import { reviewSourceBlock, writtenReviewForPayload } from "@/lib/learning/node/written-review";
import { gradeOralSemantics, oralCorpus, oralNeedsJudge, oralReviewFromPayload } from "@/lib/learning/node/oral";
import { rememberMisconceptions, unseenLessonReviews } from "@/lib/learning/node/misconceptions";
import { claimCompletion, completedAttemptBody, releaseCompletionClaim, storeCompletionResult, type CompletionOutcome } from "@/lib/learning/node/completion";
import { loadPrepTopicIndex, sameTopicAsNode, testedTopicRow } from "@/lib/learning/node/topics";
import { mistakeDraftsFromAttempt, scoreAttempt } from "@/lib/learning/node/score";
import type { NodeContext } from "./context";

export async function completeAction(context: NodeContext): Promise<NextResponse> {
  const { userId, service, options, parsed, prepId, nodeId, teachingV2, prep, node, sessionMeta, topic, kind, topicLabel, lessonReviewCards } = context;
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
