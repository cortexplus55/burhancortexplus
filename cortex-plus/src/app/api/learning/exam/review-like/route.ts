import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";

const patchSchema = z.object({
  reviewId: z.string().uuid(),
  liked: z.boolean(),
});

export async function PATCH(request: Request) {
  const guard = await withUser(request, { scope: "exam-review-like", limit: 40 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const { data: review } = await service
    .from("practice_exam_item_reviews")
    .select("id, attempt_id")
    .eq("id", parsed.data.reviewId)
    .maybeSingle();

  if (!review) return errorResponse(404, "not_found");

  const { data: attempt } = await service
    .from("practice_exam_attempts")
    .select("id")
    .eq("id", review.attempt_id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!attempt) return errorResponse(404, "not_found");

  const { error } = await service
    .from("practice_exam_item_reviews")
    .update({ liked: parsed.data.liked })
    .eq("id", review.id);

  if (error) return errorResponse(500, "generation_failed");

  return NextResponse.json({ ok: true, liked: parsed.data.liked });
}
