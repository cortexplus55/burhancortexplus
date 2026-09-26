import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { generateJson, isPremiumUser } from "@/lib/ai/generate";
import { refineVerifiedChoices, verifyPracticeQuestions } from "@/lib/learning/question-verifier";

const bodySchema = z.object({
  topic: z.string().min(3).max(300),
  questionCount: z.number().int().min(5).max(20).default(10),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
});

const resultSchema = z.object({
  title: z.string().min(1),
  durationMinutes: z.number().int().min(5).max(240).default(30),
  questions: z
    .array(
      z.object({
        question: z.string().min(1),
        options: z.array(z.string().min(1)).min(2).max(5),
        correct: z.string().min(1),
        points: z.number().int().min(1).max(10).default(1),
      }),
    )
    .min(1),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-generate", limit: 6, trackSharing: true });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsedBody = bodySchema.safeParse(await request.json());
  if (!parsedBody.success) return errorResponse(400, "invalid_input");
  const { topic, questionCount, difficulty } = parsedBody.data;

  const outcome = await generateJson({
    service,
    userId,
    actionCode: "PRACTICE_EXAM_GENERATE",
    isPremium: await isPremiumUser(service, userId),
    difficulty,
    schemaHint:
      'Yalnızca şu JSON şemasını döndür: {"title": string, "durationMinutes": number, "questions": [{"question": string, "options": string[], "correct": string, "points": number}]}. "correct" alanı options dizisindeki metinlerden biri olmalı.',
    userPrompt: `Konu: ${topic}. Zorluk: ${difficulty}. ${questionCount} soruluk çoktan seçmeli deneme sınavı üret.`,
    parse: (raw) => {
      const result = resultSchema.safeParse(raw);
      if (!result.success) return null;
      const valid = result.data.questions.filter((q) =>
        q.options.includes(q.correct),
      );
      const verified = verifyPracticeQuestions(
        valid.map((question) => ({
          question: question.question,
          options: question.options,
          correct: question.correct,
          points: question.points,
        })),
        "",
        1,
      );
      if (!verified) return null;
      return {
        ...result.data,
        questions: verified.map((question) => ({
          question: question.question,
          options: question.options,
          correct: question.correct,
          points: question.points ?? 1,
          needsSolver: question.needsSolver,
        })),
      };
    },
    refineParsed: async (value, ask) => {
      const refined = await refineVerifiedChoices(
        value.questions.map((question) => ({
          text: question.question,
          options: question.options,
          correct: [question.correct],
          multi: false,
          needsSolver: question.needsSolver,
        })),
        ask,
        "",
        1,
      );
      if (!refined) return null;
      return {
        ...value,
        questions: refined.map((question) => ({
          question: question.text,
          options: question.options,
          correct: question.correct[0] ?? question.options[0] ?? "",
          points: value.questions.find((item) => item.question === question.text)?.points ?? 1,
          needsSolver: false,
        })),
      };
    },
  });

  if (!outcome.ok) return errorResponse(outcome.status, outcome.error);

  const { data: exam, error } = await service
    .from("practice_exams")
    .insert({
      user_id: userId,
      title: outcome.data.title,
      duration_minutes: outcome.data.durationMinutes,
    })
    .select("id")
    .single();

  if (error || !exam) return errorResponse(500, "generation_failed");

  await service.from("practice_exam_questions").insert(
    outcome.data.questions.map((q, index) => ({
      exam_id: exam.id,
      question_text: q.question,
      question_type: "mcq",
      options: q.options,
      correct_answer: q.correct,
      points: q.points,
      sort_order: index,
    })),
  );

  const { data: qrows } = await service
    .from("practice_exam_questions")
    .select("id, question_text, options, points, sort_order")
    .eq("exam_id", exam.id)
    .order("sort_order");

  return NextResponse.json({
    examId: exam.id,
    title: outcome.data.title,
    durationMinutes: outcome.data.durationMinutes,
    questionCount: outcome.data.questions.length,
    creditsUsed: outcome.cost,
    questions: (qrows ?? []).map((q) => ({
      id: q.id,
      text: q.question_text,
      options: Array.isArray(q.options) ? q.options : [],
      points: q.points,
    })),
  });
}
