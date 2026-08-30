import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser, type ApiContext } from "@/lib/api/guards";
import { isPremiumUser } from "@/lib/ai/generate";
import { generateExamQuiz } from "@/lib/learning/exam-quiz-generate";
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
    .select("id, title, exam_type, active_topic_id, intro_completed_at")
    .eq("id", prepId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!prep) return errorResponse(404, "not_found");

  const nextHref = await firstReadyHref(service, prepId);

  if (prep.intro_completed_at) {
    return NextResponse.json({ ok: true, done: true, nextHref });
  }

  if (!prep.active_topic_id) {
    return NextResponse.json({
      ok: false,
      nextHref: examPrepTopicHref(prepId),
    }, { status: 409 });
  }

  const { data: topic } = await service
    .from("exam_prep_topics")
    .select("id, label")
    .eq("id", prep.active_topic_id)
    .maybeSingle();
  if (!topic) return errorResponse(404, "not_found");

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

    const questions = ((attempt.payload as { questions?: QuizQuestion[] } | null)?.questions ??
      []) as QuizQuestion[];
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
    const questions = ((existing.payload as { questions?: QuizQuestion[] }).questions ??
      []) as QuizQuestion[];
    if (questions.length) {
      return NextResponse.json({
        ok: true,
        attemptId: existing.id,
        topicLabel: topic.label,
        questions: questions.map(publicQuizQuestion),
      });
    }
  }

  const outcome = await generateExamQuiz({
    service,
    userId,
    isPremium: await isPremiumUser(service, userId),
    userPrompt: `Sınav: ${prep.title ?? prep.exam_type}. Konu: ${topic.label}.
5 çoktan seçmeli tanışma sorusu yaz. Konunun temelini yokla, aşırı tuzak kurma.
En az 2 soruda birden fazla doğru şık olsun (multi true, correct dizi).
Tek doğrularda multi false, correct tek string. correct her zaman options içinde olsun.`,
  });
  if (!outcome.ok) return errorResponse(outcome.status, outcome.error);

  const questions = outcome.questions.slice(0, 5);
  const { data: attempt, error } = await service
    .from("exam_prep_intro_attempts")
    .insert({
      exam_prep_id: prepId,
      user_id: userId,
      topic_id: topic.id,
      payload: { questions },
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
    questions: questions.map(publicQuizQuestion),
  });
}
