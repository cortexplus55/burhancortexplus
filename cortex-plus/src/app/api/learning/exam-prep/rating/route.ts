import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";

/**
 * "Bu dersi nasıl buldun?" — Astra'nın sonuç ekranındaki üç seçenek
 * (30 Eylül 2026). Cevap denemenin kendi kaydına yazılıyor (payload
 * içinde `studentRating`); ayrı tablo ya da migration gerekmiyor.
 */
const LESSON_RATINGS = ["great", "too_easy", "too_hard"] as const;

const bodySchema = z.object({
  attemptId: z.string().uuid(),
  rating: z.enum(LESSON_RATINGS),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-prep-rating", limit: 30 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");
  const { attemptId, rating } = parsed.data;

  const { data: attempt } = await service
    .from("exam_prep_node_attempts")
    .select("id, payload")
    .eq("id", attemptId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!attempt) return errorResponse(404, "not_found");

  const payload =
    attempt.payload && typeof attempt.payload === "object" && !Array.isArray(attempt.payload)
      ? (attempt.payload as Record<string, unknown>)
      : {};
  const { error } = await service
    .from("exam_prep_node_attempts")
    .update({
      payload: { ...payload, studentRating: { value: rating, at: new Date().toISOString() } },
    })
    .eq("id", attemptId)
    .eq("user_id", userId);
  if (error) return errorResponse(500, "save_failed");

  return NextResponse.json({ ok: true });
}
