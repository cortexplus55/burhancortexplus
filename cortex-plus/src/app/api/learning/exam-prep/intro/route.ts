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
import { generateExamQuiz } from "@/lib/learning/exam-quiz-generate";
import { loadSourceContext } from "@/lib/learning/source-context";
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

const bodySchema = z.object({
  prepId: z.string().uuid(),
  action: z.enum(["start", "complete"]).default("start"),
  answers: z.record(z.string(), z.unknown()).optional(),
});

async function firstReadyHref(service: ApiContext["service"], prepId: string) {
  const { data: node } = await service
    .from("exam_prep_nodes")
    .select("id")
    .eq("exam_prep_id", prepId)
    .eq("status", "ready")
    .order("sort_order")
    .limit(1)
    .maybeSingle();
  return node ? examPrepNodeHref(prepId, node.id) : examPrepHomeHref(prepId);
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
      "id, title, exam_type, active_topic_id, intro_completed_at, document_id, hard_topics_self",
    )
    .eq("id", prepId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!prep) return errorResponse(404, "not_found");

  const nextHref = await firstReadyHref(service, prepId);

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
    .select("id, label")
    .eq("id", prep.active_topic_id)
    .maybeSingle();
  if (!topic) return errorResponse(404, "not_found");

  const v2 = await isFeatureEnabled(service, PDF_LEARNING_V2_FLAG);
  let useV2Diagnostic = false;
  let plans: DiagnosticTopicPlan[] = [];

  if (v2 && prep.document_id) {
    const { data: prepTopics } = await service
      .from("exam_prep_topics")
      .select("id, label, document_topic_node_id")
      .eq("exam_prep_id", prepId);
    plans = await loadDocumentTopicPlans(
      service,
      prep.document_id,
      prepTopics ?? [],
    );
    useV2Diagnostic = plans.some(
      (p) => p.status !== "unreadable" && p.pageNumbers.length > 0,
    );
  }

  if (action === "complete") {
    const { data: attempt } = await service
      .from("exam_prep_intro_attempts")
      .select("id, payload")
      .eq("exam_prep_id", prepId)
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
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
        topicLabel:
          payload.mode === "diagnostic_v2"
            ? "Belge konu haritası tanı"
            : topic.label,
        mode: payload.mode === "diagnostic_v2" ? "diagnostic_v2" : "legacy",
        questions: questions.map((q) => publicQuizQuestion(q)),
        hardTopicsSelf: prep.hard_topics_self ?? [],
      });
    }
  }

  if (useV2Diagnostic && prep.document_id) {
    const { data: doc } = await service
      .from("documents")
      .select("source_boundary_mode")
      .eq("id", prep.document_id)
      .maybeSingle();

    const outcome = await generateTopicMapDiagnostic({
      service,
      userId,
      isPremium: await isPremiumUser(service, userId),
      prepTitle: prep.title ?? prep.exam_type,
      examType: prep.exam_type,
      documentId: prep.document_id,
      sourceBoundaryMode:
        (doc?.source_boundary_mode as "documents_only" | "allow_supporting" | null) ??
        "documents_only",
      plans,
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
        topicLabel: "Belge konu haritası tanı",
        mode: "diagnostic_v2",
        questions: outcome.questions.map((q) => publicQuizQuestion(q)),
        hardTopicsSelf: prep.hard_topics_self ?? [],
        unmeasuredTopics: outcome.plans
          .filter((p) => p.status === "unreadable" || !p.pageNumbers.length)
          .map((p) => ({ title: p.title, reason: p.reason, status: p.status })),
      });
    }
    // Verification/provider failure → legacy 5-question intro so the student
    // is not stuck on an error screen.
    console.error("diagnostic_v2_fallback_legacy", {
      prepId,
      error: outcome.error,
      status: outcome.status,
    });
  }

  let source;
  try {
    source = await loadSourceContext(
      service,
      userId,
      `${prep.title ?? prep.exam_type} ${topic.label}`,
      { documentId: prep.document_id ?? null, limit: 6 },
    );
  } catch {
    return errorResponse(503, "source_unavailable");
  }

  const isPremium = await isPremiumUser(service, userId);
  let outcome = await generateExamQuiz({
    service,
    userId,
    isPremium,
    difficulty: "hard",
    userPrompt: `Sınav: ${prep.title ?? prep.exam_type}. Konu: ${topic.label}.${source.block}
5 çoktan seçmeli tanışma sorusu yaz. Konunun temelini yokla, aşırı tuzak kurma.
Tüm sorularda multi false (tek doğru). correct her zaman options içinde olsun.
Her soruyu göndermeden önce bilimsel ve matematiksel doğruluğunu kontrol et. Soru kökü ile doğru seçenek tam olarak uyuşsun.`,
  });
  if (!outcome.ok && outcome.error === "content_verification_failed") {
    outcome = await generateExamQuiz({
      service,
      userId,
      isPremium,
      difficulty: "hard",
      verificationMode: "schema",
      userPrompt: `Sınav: ${prep.title ?? prep.exam_type}. Konu: ${topic.label}.${source.block}
5 kısa çoktan seçmeli tanışma sorusu. Hepsi multi false, tek doğru şık. Belge alıntılarına dayan.`,
    });
  }
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
