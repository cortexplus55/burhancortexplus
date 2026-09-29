import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser, type ApiContext } from "@/lib/api/guards";
import { isPremiumUser } from "@/lib/ai/generate";
import { isFeatureEnabled, PDF_LEARNING_V2_FLAG } from "@/lib/admin/feature-flags";
import {
  generateTopicMapDiagnostic,
  loadDocumentTopicPlans,
  parseStoredDiagnosticQuestions,
  scoreAndNormalizeDiagnostic,
} from "@/lib/learning/diagnostic-generate";
import type { DiagnosticTopicPlan } from "@/lib/learning/diagnostic";
import { diagnosticTopicSource } from "@/lib/learning/diagnostic-source";
import { generateExamQuiz } from "@/lib/learning/exam-quiz-generate";
import {
  EMPTY_SOURCE_CONTEXT,
  loadSourceContext,
} from "@/lib/learning/source-context";
import {
  resolvePrepSourceMode,
  shouldSearchSources,
  topicFence,
} from "@/lib/learning/prep-source";
import {
  publicQuizQuestion,
  scoreQuizAnswers,
  type QuizQuestion,
} from "@/lib/learning/exam-quiz";
import {
  examPrepHomeHref,
  examPrepNodeHref,
  examPrepTopicHref,
} from "@/lib/learning/exam-prep-hrefs";
import { nodeForTopic } from "@/lib/learning/exam-prep-ui-path";
import { parseSessionMeta } from "@/lib/learning/teaching-standards";

const bodySchema = z.object({
  prepId: z.string().uuid(),
  attemptId: z.string().uuid().optional(),
  action: z.enum(["start", "complete", "skip"]).default("start"),
  answers: z.record(z.string(), z.unknown()).optional(),
});

async function firstReadyHref(service: ApiContext["service"], prepId: string, activeTopicId: string | null) {
  const { data: nodes } = await service
    .from("exam_prep_nodes")
    .select("id, status, sort_order, session_meta")
    .eq("exam_prep_id", prepId)
    .order("sort_order");
  const rows = nodes ?? [];
  if (activeTopicId) {
    const { data: topic } = await service
      .from("exam_prep_topics")
      .select("id, label, document_topic_node_id")
      .eq("id", activeTopicId)
      .eq("exam_prep_id", prepId)
      .maybeSingle();
    if (topic) {
      const chosen = nodeForTopic(
        rows.map((row) => ({
          id: row.id as string,
          sortOrder: (row.sort_order as number) ?? 0,
          status: row.status as "locked" | "ready" | "done",
          sessionMeta: parseSessionMeta(row.session_meta),
        })),
        { ids: [topic.id, topic.document_topic_node_id], label: topic.label },
      );
      if (chosen) {
        if (chosen.status === "locked") {
          const { error } = await service.from("exam_prep_nodes")
            .update({ status: "ready" })
            .eq("id", chosen.id)
            .eq("exam_prep_id", prepId);
          if (error) return examPrepHomeHref(prepId);
        }
        return examPrepNodeHref(prepId, chosen.id);
      }
    }
  }
  const firstReady = rows.find((row) => row.status === "ready");
  return firstReady ? examPrepNodeHref(prepId, firstReady.id) : examPrepHomeHref(prepId);
}

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-prep-intro", limit: 12 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const { prepId, action } = parsed.data;

  const { data: prep } = await service
    .from("exam_preps")
    .select(
      "id, title, exam_type, active_topic_id, intro_completed_at, document_id, source_document_ids, hard_topics_self",
    )
    .eq("id", prepId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!prep) return errorResponse(404, "not_found");

  const nextHref = await firstReadyHref(service, prepId, prep.active_topic_id as string | null);

  // Erteleme: ölçüm yapılmadı, yalnızca kapı açıldı. intro_completed_at
  // dolmuyor ki hazırlık sayfası hatırlatmayı sürdürebilsin.
  if (action === "skip") {
    const { error } = await service
      .from("exam_preps")
      .update({ intro_deferred_at: new Date().toISOString() })
      .eq("id", prepId)
      .eq("user_id", userId);
    if (error) return errorResponse(503, "save_failed");
    return NextResponse.json({ ok: true, deferred: true, nextHref });
  }

  if (prep.intro_completed_at) {
    const { data: summary } = await service
      .from("exam_prep_diagnostic_summaries")
      .select("starting_level_label, overall_measured, evidence, topic_results")
      .eq("exam_prep_id", prepId)
      .maybeSingle();
    return NextResponse.json({
      ok: true,
      done: true,
      nextHref,
      diagnostic: summary
        ? {
            startingLevelLabel: summary.starting_level_label,
            overallMeasured: summary.overall_measured,
            evidence: summary.evidence,
            topicResults: summary.topic_results,
            hardTopicsSelf: prep.hard_topics_self ?? [],
          }
        : null,
    });
  }

  if (!prep.active_topic_id) {
    return NextResponse.json(
      {
        ok: false,
        nextHref: examPrepTopicHref(prepId),
      },
      { status: 409 },
    );
  }

  const { data: topic } = await service
    .from("exam_prep_topics")
    .select("id, label, document_topic_node_id, source_refs")
    .eq("id", prep.active_topic_id)
    .eq("exam_prep_id", prepId)
    .maybeSingle();
  if (!topic) return errorResponse(404, "not_found");

  // A prep can contain several PDFs. The first-lesson diagnostic must read
  // the selected topic's own source, not blindly the prep's first document.
  const selectedSource = diagnosticTopicSource({
    primaryDocumentId: prep.document_id as string | null,
    sourceDocumentIds: prep.source_document_ids,
    documentTopicNodeId: topic.document_topic_node_id as string | null,
    sourceRefs: topic.source_refs,
  });
  let diagnosticDocumentId = selectedSource.documentId;
  const diagnosticNodeId = selectedSource.nodeId;
  if (!selectedSource.fromRef && diagnosticNodeId) {
    const { data: linkedNode } = await service
      .from("document_topic_nodes")
      .select("document_id")
      .eq("id", diagnosticNodeId)
      .maybeSingle();
    if (linkedNode?.document_id && selectedSource.allowedDocumentIds.has(linkedNode.document_id as string)) {
      diagnosticDocumentId = linkedNode.document_id as string;
    }
  }
  if (diagnosticDocumentId) {
    const { data: ownedDocument } = await service
      .from("documents")
      .select("id")
      .eq("id", diagnosticDocumentId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!ownedDocument) return errorResponse(503, "source_unavailable");
  }

  const v2 = await isFeatureEnabled(service, PDF_LEARNING_V2_FLAG);
  let useV2Diagnostic = false;
  let plans: DiagnosticTopicPlan[] = [];

  if (v2 && diagnosticDocumentId) {
    plans = await loadDocumentTopicPlans(
      service,
      diagnosticDocumentId,
      [{ id: topic.id, label: topic.label, document_topic_node_id: diagnosticNodeId }],
    );
    useV2Diagnostic = plans.some(
      (p) => p.status !== "unreadable" && p.pageNumbers.length > 0,
    );
  }

  if (action === "complete") {
    let attemptQuery = service
      .from("exam_prep_intro_attempts")
      .select("id, payload")
      .eq("exam_prep_id", prepId)
      .eq("user_id", userId)
      .eq("topic_id", topic.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1);
    if (parsed.data.attemptId) attemptQuery = attemptQuery.eq("id", parsed.data.attemptId);
    const { data: attempt } = await attemptQuery.maybeSingle();
    if (!attempt) return errorResponse(400, "invalid_input");

    const payload = (attempt.payload as {
      mode?: string;
      questions?: QuizQuestion[];
      plans?: DiagnosticTopicPlan[];
    } | null) ?? {};

    if (payload.mode === "diagnostic_v2") {
      const questions = parseStoredDiagnosticQuestions(payload.questions);
      if (!questions?.length) return errorResponse(400, "invalid_input");
      const planned = (payload.plans as DiagnosticTopicPlan[] | undefined) ?? plans;
      const scored = scoreAndNormalizeDiagnostic(
        questions,
        parsed.data.answers ?? {},
        planned,
      );

      await service
        .from("exam_prep_intro_attempts")
        .update({
          status: "completed",
          score: scored.score,
          total: scored.total,
          payload: {
            ...payload,
            diagnosticResult: scored,
          },
        })
        .eq("id", attempt.id);

      for (const result of scored.topicResults) {
        if (!result.examPrepTopicId) continue;
        await service
          .from("exam_prep_topics")
          .update({
            measured_level: result.measuredLevel,
            diagnostic_status: result.status,
            diagnostic_evidence: result.evidence,
            // Do not overwrite familiarity (self-report).
          })
          .eq("id", result.examPrepTopicId)
          .eq("exam_prep_id", prepId);
      }

      await service.from("exam_prep_diagnostic_summaries").upsert(
        {
          exam_prep_id: prepId,
          user_id: userId,
          intro_attempt_id: attempt.id,
          starting_level_label: scored.startingLevelLabel,
          overall_measured: scored.overallMeasured,
          evidence: scored.evidence,
          topic_results: scored.topicResults,
        },
        { onConflict: "exam_prep_id" },
      );

      try {
        const { isFeatureEnabled, ADAPTIVE_LEARNING_FLAG } = await import(
          "@/lib/admin/feature-flags"
        );
        if (await isFeatureEnabled(service, ADAPTIVE_LEARNING_FLAG, userId)) {
          const { seedStudentStateFromDiagnostic } = await import(
            "@/lib/adaptive/diagnostic-seed"
          );
          await seedStudentStateFromDiagnostic(service, userId, prepId);
        }
      } catch {
        // Adaptive seed must not break intro completion.
      }

      await service
        .from("exam_preps")
        .update({ intro_completed_at: new Date().toISOString() })
        .eq("id", prepId);

      return NextResponse.json({
        ok: true,
        score: scored.score,
        total: scored.total,
        nextHref,
        mode: "diagnostic_v2",
        diagnostic: {
          startingLevelLabel: scored.startingLevelLabel,
          overallMeasured: scored.overallMeasured,
          evidence: scored.evidence,
          topicResults: scored.topicResults,
          hardTopicsSelf: prep.hard_topics_self ?? [],
        },
      });
    }

    const questions = (payload.questions ?? []) as QuizQuestion[];
    const scored = scoreQuizAnswers(questions, parsed.data.answers ?? {});

    await service
      .from("exam_prep_intro_attempts")
      .update({
        status: "completed",
        score: scored.score,
        total: scored.total,
      })
      .eq("id", attempt.id);

    await service
      .from("exam_preps")
      .update({ intro_completed_at: new Date().toISOString() })
      .eq("id", prepId);

    return NextResponse.json({
      ok: true,
      score: scored.score,
      total: scored.total,
      nextHref,
      mode: "legacy",
    });
  }

  const { data: existing } = await service
    .from("exam_prep_intro_attempts")
    .select("id, payload")
    .eq("exam_prep_id", prepId)
    .eq("user_id", userId)
    .eq("topic_id", topic.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.payload) {
    const payload = existing.payload as {
      mode?: string;
      questions?: QuizQuestion[];
    };
    const questions = payload.questions ?? [];
    if (questions.length) {
      return NextResponse.json({
        ok: true,
        attemptId: existing.id,
        topicLabel: topic.label,
        mode: payload.mode === "diagnostic_v2" ? "diagnostic_v2" : "legacy",
        questions: questions.map((q) => publicQuizQuestion(q)),
        hardTopicsSelf: prep.hard_topics_self ?? [],
      });
    }
  }

  if (useV2Diagnostic && diagnosticDocumentId) {
    const { data: doc } = await service
      .from("documents")
      .select("source_boundary_mode")
      .eq("id", diagnosticDocumentId)
      .maybeSingle();

    const outcome = await generateTopicMapDiagnostic({
      service,
      userId,
      isPremium: await isPremiumUser(service, userId),
      prepTitle: prep.title ?? prep.exam_type,
      examType: prep.exam_type,
      documentId: diagnosticDocumentId,
      sourceBoundaryMode:
        (doc?.source_boundary_mode as "documents_only" | "allow_supporting" | null) ??
        "documents_only",
      plans,
      activePrepTopicId: topic.id,
    });
    if (outcome.ok) {
      const { data: attempt, error } = await service
        .from("exam_prep_intro_attempts")
        .insert({
          exam_prep_id: prepId,
          user_id: userId,
          topic_id: topic.id,
          payload: {
            mode: "diagnostic_v2",
            questions: outcome.questions,
            plans: outcome.plans,
          },
          total: outcome.questions.length,
          status: "active",
        })
        .select("id")
        .single();

      if (error || !attempt) return errorResponse(500, "generation_failed");

      return NextResponse.json({
        ok: true,
        attemptId: attempt.id,
        topicLabel: topic.label,
        mode: "diagnostic_v2",
        questions: outcome.questions.map((q) => publicQuizQuestion(q)),
        hardTopicsSelf: prep.hard_topics_self ?? [],
        unmeasuredTopics: outcome.plans
          .filter((p) => p.status === "unreadable" || !p.pageNumbers.length)
          .map((p) => ({ title: p.title, reason: p.reason, status: p.status })),
      });
    }
    if (outcome.error === "insufficient_source_variety") {
      return NextResponse.json({
        ok: true,
        sourceLimited: true,
        topicLabel: topic.label,
        nextHref,
      });
    }
    // The source or clinical question gate failed. A weaker second generator
    // must not turn rejected answers into a scored diagnosis.
    console.error("diagnostic_v2_rejected", {
      prepId,
      error: outcome.error,
      status: outcome.status,
    });
    return errorResponse(outcome.status, outcome.error);
  }

  // Belge seçili değilse arama yapılmaz: filtresiz arama öğrencinin ilgisiz
  // belgelerinden parça çekiyordu. Belgesiz hazırlıkta çit konunun kendisi.
  const sourceMode = resolvePrepSourceMode({ documentId: diagnosticDocumentId });
  let source = EMPTY_SOURCE_CONTEXT;
  if (shouldSearchSources(sourceMode)) {
    try {
      source = await loadSourceContext(
        service,
        userId,
        `${prep.title ?? prep.exam_type} ${topic.label}`,
        { documentId: diagnosticDocumentId, limit: 6 },
      );
    } catch {
      return errorResponse(503, "source_unavailable");
    }
  }
  const topicBlock =
    sourceMode === "topic_only"
      ? topicFence({
          topic: topic.label,
          examTitle: prep.title,
          examType: prep.exam_type,
        })
      : "";

  const isPremium = await isPremiumUser(service, userId);
  /*
    Tanışma testi öğrenciyi PUANLIYOR; iki doğru şıklı bir soru onu yanlış
    ölçer. 29 Eylül 2026'da belgesiz "Üslü sayılar" hazırlığında ilk soru
    "hangisi üslü sayıların özelliğidir" diye sordu ve hem "çarpmada üsler
    toplanır" hem "bölmede üsler çıkarılır" şıkları doğruydu; anahtar
    yalnızca birini tutuyordu. Kesin doğrulayıcı sayıyı ve denklemi
    denetliyor, kavramsal çift doğruyu göremiyor. Tanı üretimindeki gibi
    ikinci göz "her sorunun tek ve kesin doğru cevabı var mı" diye bakıyor.
  */
  const outcome = await generateExamQuiz({
    service,
    userId,
    isPremium,
    difficulty: "hard",
    verifyOptionReasoning: true,
    maxDraftAttempts: 2,
    sourceExcerpt: source.block,
    requireSourceSupport: sourceMode !== "topic_only",
    userPrompt: `Sınav: ${prep.title ?? prep.exam_type}. Konu: ${topic.label}.${source.block}${topicBlock}
5 çoktan seçmeli tanışma sorusu yaz. Konunun temelini yokla, aşırı tuzak kurma.
Tüm sorularda multi false (tek doğru). correct her zaman options içinde olsun.
Her soruyu göndermeden önce bilimsel ve matematiksel doğruluğunu kontrol et. Soru kökü ile doğru seçenek tam olarak uyuşsun.`,
  });
  if (!outcome.ok) return errorResponse(outcome.status, outcome.error);

  const questions = outcome.questions.slice(0, 5);
  const { data: attempt, error } = await service
    .from("exam_prep_intro_attempts")
    .insert({
      exam_prep_id: prepId,
      user_id: userId,
      topic_id: topic.id,
      payload: { mode: "legacy", questions },
      total: questions.length,
      status: "active",
    })
    .select("id")
    .single();

  if (error || !attempt) return errorResponse(500, "generation_failed");

  return NextResponse.json({
    ok: true,
    attemptId: attempt.id,
    topicLabel: topic.label,
    mode: "legacy",
    questions: questions.map(publicQuizQuestion),
  });
}
