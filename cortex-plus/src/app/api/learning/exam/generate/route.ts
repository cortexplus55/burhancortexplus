import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { generateJson, isPremiumUser } from "@/lib/ai/generate";

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
  const guard = await withUser(request, { scope: "exam-generate", limit: 6 });
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
      return valid.length ? { ...result.data, questions: valid } : null;
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

  return NextResponse.json({
    examId: exam.id,
    title: outcome.data.title,
    questionCount: outcome.data.questions.length,
    creditsUsed: outcome.cost,
  });
}
