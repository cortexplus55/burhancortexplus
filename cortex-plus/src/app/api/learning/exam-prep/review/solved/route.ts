import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { isFeatureEnabled, SPACED_REVIEW_FLAG } from "@/lib/admin/feature-flags";
import { reviewPromptKey } from "@/lib/learning/review-items";
import { recordReviewItems } from "@/lib/learning/review-items-store";
import { verifyReviewToken } from "@/lib/solve/solve-review";

/**
 * Soru çözücüde çözülen soruyu hazırlığın tekrar listesine ekler (23 Ekim 2026). Soru ve doğru cevap imzalı
 * belirteçten gelir (`solve-review.ts`); tarayıcı anahtarı değiştiremez. Yanlış gibi yarından başlar (1-3-7-14).
 * Aynı soru ikinci kez eklenmez (hazırlık + soru özeti tekil).
 */
const bodySchema = z.object({
  prepId: z.string().uuid(),
  token: z.string().min(20).max(24_000),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "prep-review-solved", limit: 20, dailyLimit: 200 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");
  const verified = verifyReviewToken(parsed.data.token, userId);
  if (!verified) return errorResponse(400, "invalid_input");

  if (!(await isFeatureEnabled(service, SPACED_REVIEW_FLAG))) return errorResponse(404, "not_found");
  const { data: prep } = await service
    .from("exam_preps")
    .select("id, exam_date")
    .eq("id", parsed.data.prepId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!prep) return errorResponse(404, "not_found");

  const { scheduled } = await recordReviewItems(service, {
    userId,
    prepId: parsed.data.prepId,
    nodeId: null,
    attemptId: null,
    topicId: null,
    examDate: (prep.exam_date as string | null) ?? null,
    drafts: [
      {
        sourceKind: "quiz",
        reason: "miss",
        sourceRef: `photo:${verified.ref}`,
        topicLabel: null,
        item: verified.item,
        promptKey: reviewPromptKey(verified.item),
      },
    ],
  });
  return NextResponse.json({ ok: true, scheduled });
}
