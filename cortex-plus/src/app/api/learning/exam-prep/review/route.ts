import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { isFeatureEnabled, SPACED_REVIEW_FLAG } from "@/lib/admin/feature-flags";
import { answerReviewItem } from "@/lib/learning/review-items-store";
import { recordUserActivity } from "@/lib/streak/record-activity";
import { recordReviewAnswerEvidence } from "@/lib/learning/learning-tracking-persist";

/**
 * Günü gelen tekrarın cevabı (20 Ekim 2026). Not sunucuda: doğru cevap tarayıcıya cevaptan önce
 * gitmez (Yanlışlar Defteri'nin kalıbı). Kredi yok, model yok, yıldız yok (ürün sahibinin kararı).
 * Faz 4: cevap konu kanıtıdır (tekrar cevabı ağırlığıyla, `recordReviewAnswerEvidence`); `practice` (ücretsiz hedefli
 * tekrar) günü gelmemiş kayıtlı soruyu da notlar, tekrar takvimini değiştirmez.
 */
const bodySchema = z.object({
  prepId: z.string().uuid(),
  itemId: z.string().uuid(),
  pick: z.union([z.string().min(1).max(400), z.array(z.string().min(1).max(400)).min(1).max(6)]).optional(),
  recalled: z.boolean().optional(),
  quality: z.union([z.literal(1), z.literal(4), z.literal(5)]).optional(),
  practice: z.boolean().optional(),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "prep-review", limit: 40, dailyLimit: 600 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");
  const { prepId, itemId, pick, recalled, quality, practice } = parsed.data;
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
    practice: practice === true,
  });
  if ("error" in outcome) {
    if (outcome.error === "not_found") return errorResponse(404, "not_found");
    if (outcome.error === "invalid_answer") return errorResponse(400, "invalid_input");
    if (outcome.error === "not_due") {
      return NextResponse.json({ error: "Bu tekrarın günü henüz gelmedi.", code: "not_due" }, { status: 409 });
    }
    return errorResponse(503, "save_failed");
  }

  // Bilgi kartı ("Hatırladım / Hatırlamadım") öz bildirimdir: konu kanıtı yalnız notlanan sorudan (şık seçimi).
  if (pick !== undefined) {
    await recordReviewAnswerEvidence(service, { userId, prepId, topicLabel: outcome.topicLabel, correct: outcome.correct });
  }

  try {
    await recordUserActivity(service, userId, "prep_review");
  } catch {
    // Seri ek bilgi; cevap kaydedildi.
  }

  // Konu adı kanıt yazımı için; cevapta dönmez (tarayıcıya yalnız sonucun kendisi).
  const publicOutcome: Partial<typeof outcome> = { ...outcome };
  delete publicOutcome.topicLabel;
  return NextResponse.json({ ok: true, ...publicOutcome });
}
