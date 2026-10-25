import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { isFeatureEnabled, SPACED_REVIEW_FLAG } from "@/lib/admin/feature-flags";
import { answerReviewItem } from "@/lib/learning/review-items-store";
import { recordUserActivity } from "@/lib/streak/record-activity";

/**
 * Günü gelen tekrarın cevabı (20 Ekim 2026). Not sunucuda: doğru cevap tarayıcıya cevaptan önce
 * gitmez (Yanlışlar Defteri'nin kalıbı). Kredi yok, model yok, yıldız yok (ürün sahibinin kararı);
 * cevap konu hâkimiyetine de yazılmaz (v1), yalnız öğenin kaydına.
 */
const bodySchema = z.object({
  prepId: z.string().uuid(),
  itemId: z.string().uuid(),
  pick: z.union([z.string().min(1).max(400), z.array(z.string().min(1).max(400)).min(1).max(6)]).optional(),
  recalled: z.boolean().optional(),
  quality: z.union([z.literal(1), z.literal(4), z.literal(5)]).optional(),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "prep-review", limit: 40, dailyLimit: 600 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");
  const { prepId, itemId, pick, recalled, quality } = parsed.data;
  if (pick === undefined && recalled === undefined && quality === undefined) return errorResponse(400, "invalid_input");

  if (!(await isFeatureEnabled(service, SPACED_REVIEW_FLAG))) return errorResponse(404, "not_found");

  const { data: prep } = await service
    .from("exam_preps")
    .select("id, exam_date")
    .eq("id", prepId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!prep) return errorResponse(404, "not_found");

  const outcome = await answerReviewItem(service, {
    userId,
    prepId,
    itemId,
    answer: { pick, recalled, quality },
    examDate: (prep.exam_date as string | null) ?? null,
  });
  if ("error" in outcome) {
    if (outcome.error === "not_found") return errorResponse(404, "not_found");
    if (outcome.error === "invalid_answer") return errorResponse(400, "invalid_input");
    if (outcome.error === "not_due") {
      return NextResponse.json({ error: "Bu tekrarın günü henüz gelmedi.", code: "not_due" }, { status: 409 });
    }
    return errorResponse(503, "save_failed");
  }

  try {
    await recordUserActivity(service, userId, "prep_review");
  } catch {
    // Seri ek bilgi; cevap kaydedildi.
  }

  return NextResponse.json({ ok: true, ...outcome });
}
