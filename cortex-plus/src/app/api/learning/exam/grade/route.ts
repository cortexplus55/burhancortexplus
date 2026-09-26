import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { gradeMockExam } from "@/lib/learning/mock-exam/grade-exam";

const bodySchema = z.object({
  examId: z.string().uuid(),
  answers: z.record(z.string().uuid(), z.union([z.string(), z.array(z.string())])),
  flaggedIds: z.array(z.string().uuid()).optional(),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-grade", limit: 10 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsedBody = bodySchema.safeParse(await request.json());
  if (!parsedBody.success) return errorResponse(400, "invalid_input");

  const result = await gradeMockExam({
    service,
    userId,
    examId: parsedBody.data.examId,
    answers: parsedBody.data.answers,
    flaggedIds: parsedBody.data.flaggedIds,
  });

  if (!result.ok) return errorResponse(result.status, result.error);

  // Bitişte asla 402 yok — değerlendirme ücretsiz / üretime dahil.
  return NextResponse.json({
    attemptId: result.attemptId,
    score: result.score,
    correct: result.correct,
    wrong: result.wrong,
    blank: result.blank,
    topicReport: result.topicReport,
    analysis: result.analysis,
  });
}
