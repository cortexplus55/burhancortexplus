import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/api/guards";
import { recordMistakes } from "@/lib/learning/mistake-notebook";
import { recordUserActivity } from "@/lib/streak/record-activity";
import { createServiceClient } from "@/lib/supabase/server";

/**
 * Studio quiz sonuçlarını sunucuda işler: yanlışları deftere yazar, streak günceller.
 * Doğru yanıtlar istemciden gelmez — quiz_questions tablosundan okunur.
 */
const schema = z.object({
  quizId: z.string().uuid(),
  answers: z.array(
    z.object({
      questionId: z.string().uuid(),
      selected: z.string().max(2000),
    }),
  ),
  topic: z.string().max(200).optional(),
});

export async function POST(request: Request) {
  const guard = await withUser(request, {
    scope: "quiz-grade",
    limit: 20,
    dailyLimit: 120,
  });
  if (!guard.ok) return guard.response;
  const { supabase, userId } = guard.ctx;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const { quizId, answers, topic } = parsed.data;

  const { data: quiz } = await supabase
    .from("quizzes")
    .select("id, title, user_id")
    .eq("id", quizId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!quiz) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: questions } = await supabase
    .from("quiz_questions")
    .select("id, question_text, options, correct_answer, explanation, sort_order")
    .eq("quiz_id", quizId)
    .order("sort_order");

  if (!questions?.length) {
    return NextResponse.json({ error: "no_questions" }, { status: 400 });
  }

  const answerMap = new Map(answers.map((a) => [a.questionId, a.selected]));
  let correct = 0;
  let incorrect = 0;
  let blank = 0;
  const wrongDrafts: {
    source: "quiz";
    sourceQuestionId: string;
    topicLabel: string | null;
    questionText: string;
    options: string[] | null;
    correctAnswer: string | null;
    wrongAnswer: string | null;
    explanation: string | null;
  }[] = [];

  const topicPerformance = new Map<string, { correct: number; total: number }>();
  const topicLabel = topic?.trim() || (quiz.title as string) || "Quiz";
  /**
   * Soru bazında sonuç. Doğru yanıt ve açıklama yalnızca notlandırmadan
   * SONRA dönüyor — soru paketiyle birlikte gitmiyor (bkz. mistake-notebook).
   */
  const items: {
    questionId: string;
    status: "correct" | "incorrect" | "blank";
    correctAnswer: string | null;
    explanation: string | null;
  }[] = [];

  for (const q of questions) {
    const selected = answerMap.get(q.id as string);
    const right = ((q.correct_answer as string) ?? "").trim();
    const options = Array.isArray(q.options) ? (q.options as string[]) : [];
    const explanation =
      ((q.explanation as string | null) ?? "").trim() ||
      (right ? `Doğru yanıt: ${right}` : null);
    const bucket = topicPerformance.get(topicLabel) ?? { correct: 0, total: 0 };
    bucket.total += 1;

    if (selected == null || selected.trim() === "") {
      blank += 1;
      topicPerformance.set(topicLabel, bucket);
      items.push({
        questionId: q.id as string,
        status: "blank",
        correctAnswer: right || null,
        explanation,
      });
      continue;
    }

    if (selected.trim() === right) {
      correct += 1;
      bucket.correct += 1;
      items.push({
        questionId: q.id as string,
        status: "correct",
        correctAnswer: right || null,
        explanation,
      });
    } else {
      incorrect += 1;
      items.push({
        questionId: q.id as string,
        status: "incorrect",
        correctAnswer: right || null,
        explanation,
      });
      wrongDrafts.push({
        source: "quiz",
        sourceQuestionId: q.id as string,
        topicLabel,
        questionText: q.question_text as string,
        options,
        correctAnswer: right || null,
        wrongAnswer: selected,
        explanation,
      });
    }
    topicPerformance.set(topicLabel, bucket);
  }

  const service = createServiceClient();
  if (wrongDrafts.length) {
    await recordMistakes(service, userId, wrongDrafts);
    if (topicLabel) {
      await service.from("weak_topics").insert({
        user_id: userId,
        topic_label: topicLabel,
        severity: incorrect / Math.max(1, questions.length),
        source: "quiz",
      });
    }
  }

  await recordUserActivity(service, userId, "quiz");

  const total = questions.length;
  const score = total ? Math.round((correct / total) * 100) : 0;
  const weakTopics = [...topicPerformance.entries()]
    .filter(([, v]) => v.total > 0 && v.correct / v.total < 0.7)
    .map(([label]) => label);

  return NextResponse.json({
    score,
    correct,
    incorrect,
    blank,
    total,
    weakTopics,
    mistakesRecorded: wrongDrafts.length,
    items,
  });
}
