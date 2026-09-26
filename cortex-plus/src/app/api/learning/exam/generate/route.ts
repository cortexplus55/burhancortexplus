import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { isPremiumUser } from "@/lib/ai/generate";
import { createMockExam } from "@/lib/learning/mock-exam/create";

const bodySchema = z.object({
  topic: z.string().min(3).max(300),
  questionCount: z.number().int().min(5).max(20).default(10),
  difficulty: z.enum(["easy", "medium", "hard"]).default("medium"),
  /** Stüdyo hazırlığa bağlıysa. */
  prepId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-generate", limit: 6, trackSharing: true });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsedBody = bodySchema.safeParse(await request.json());
  if (!parsedBody.success) return errorResponse(400, "invalid_input");
  const { topic, questionCount, prepId } = parsedBody.data;

  // Stüdyo: prep yoksa geçici prep veya topic-only deneme.
  let resolvedPrepId = prepId;
  if (!resolvedPrepId) {
    const { data: prep, error } = await service
      .from("exam_preps")
      .insert({
        user_id: userId,
        title: topic.slice(0, 80),
        exam_type: "deneme",
      })
      .select("id")
      .single();
    if (error || !prep) return errorResponse(500, "generation_failed");
    resolvedPrepId = prep.id as string;
    await service.from("exam_prep_topics").insert({
      exam_prep_id: resolvedPrepId,
      label: topic,
      sort_order: 0,
      status: "ready",
    });
  }

  const result = await createMockExam({
    service,
    userId,
    isPremium: await isPremiumUser(service, userId),
    prepId: resolvedPrepId,
    topicLabel: topic,
    questionCount,
    preset: questionCount <= 12 ? "short" : "standard",
  });

  if (!result.ok) return errorResponse(result.status, result.error);

  const { data: rows } = await service
    .from("practice_exam_questions")
    .select("id, question_text, options, points, question_type")
    .eq("exam_id", result.examId)
    .order("sort_order");

  return NextResponse.json({
    examId: result.examId,
    title: topic,
    durationMinutes: result.blueprint.durationMinutes,
    questions: (rows ?? []).map((row) => ({
      id: row.id,
      text: row.question_text,
      options: (row.options as string[]) ?? [],
      points: row.points ?? 1,
      question_type: row.question_type,
    })),
  });
}
