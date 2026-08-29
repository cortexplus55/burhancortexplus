import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";

const bodySchema = z.object({
  targetScore: z.number().int().min(1).max(100),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-prep-goal", limit: 20 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const { data: existing } = await service
    .from("exam_preps")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    const { error } = await service
      .from("exam_preps")
      .update({ target_score: parsed.data.targetScore })
      .eq("id", existing.id);
    if (error) return errorResponse(500, "generation_failed");
  } else {
    const { error } = await service.from("exam_preps").insert({
      user_id: userId,
      exam_type: "hedef",
      title: "Hedef puan",
      target_score: parsed.data.targetScore,
    });
    if (error) return errorResponse(500, "generation_failed");
  }

  return NextResponse.json({ ok: true });
}
