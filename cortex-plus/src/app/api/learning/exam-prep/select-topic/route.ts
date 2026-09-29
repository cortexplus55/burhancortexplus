import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { selectPrepTopic } from "@/lib/learning/select-prep-topic";

const bodySchema = z.object({
  prepId: z.string().uuid(),
  topicId: z.string().uuid(),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-prep-select-topic", limit: 40 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const result = await selectPrepTopic(service, {
    userId,
    prepId: parsed.data.prepId,
    topicId: parsed.data.topicId,
  });
  if (!result.ok) return errorResponse(404, "not_found");
  return NextResponse.json({ ok: true, nextHref: result.nextHref });
}
