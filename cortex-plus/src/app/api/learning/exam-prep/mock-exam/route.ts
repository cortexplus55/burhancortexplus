import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { isPremiumUser } from "@/lib/ai/generate";
import { createMockExam } from "@/lib/learning/mock-exam/create";

const bodySchema = z.object({
  prepId: z.string().uuid(),
  preset: z.enum(["short", "standard", "real"]).optional(),
  scope: z.enum(["all", "topics"]).optional(),
  topicIds: z.array(z.string().uuid()).max(40).optional(),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-mock", limit: 8, trackSharing: true });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const result = await createMockExam({
    service,
    userId,
    isPremium: await isPremiumUser(service, userId),
    prepId: parsed.data.prepId,
    preset: parsed.data.preset,
    scope: parsed.data.scope,
    topicIds: parsed.data.topicIds,
  });

  if (!result.ok) return errorResponse(result.status, result.error);

  return NextResponse.json({
    ok: true,
    examId: result.examId,
    planned: result.planned,
    ready: result.ready,
    note: result.note,
    durationMinutes: result.blueprint.durationMinutes,
  });
}
