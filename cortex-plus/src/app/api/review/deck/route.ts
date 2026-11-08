import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { addGeneralReviewCards, answerGeneralReviewCard } from "@/lib/learning/general-review";
import { REMEMBER_MAX_ITEMS } from "@/lib/learning/remember-facts";
import { recordUserActivity } from "@/lib/streak/record-activity";

/**
 * Genel tekrar destesi (8 Kasım 2026). POST `{ facts }`: sohbetin "Akılda kalsın" maddelerini desteye ekler.
 * PATCH `{ cardId, knew }`: kartın yanıtını yazar. Kredi yok, model yok; kart kodla kurulur.
 */
const addSchema = z.object({
  facts: z.array(z.string().trim().min(4).max(400)).min(1).max(REMEMBER_MAX_ITEMS),
});

const answerSchema = z.object({
  cardId: z.string().uuid(),
  knew: z.boolean(),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "review-deck-add", limit: 20, dailyLimit: 200 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;
  const parsed = addSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const result = await addGeneralReviewCards(service, userId, parsed.data.facts);
  if (!result.ok) {
    if (result.reason === "no_cards") {
      return NextResponse.json({ error: "Bu maddelerden tekrar kartı kurulamadı.", code: "no_cards" }, { status: 422 });
    }
    return errorResponse(503, "save_failed");
  }
  return NextResponse.json({ added: result.added, skipped: result.skipped, firstDue: result.firstDue });
}

export async function PATCH(request: Request) {
  const guard = await withUser(request, { scope: "review-deck-answer", limit: 60, dailyLimit: 800 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;
  const parsed = answerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const result = await answerGeneralReviewCard(service, userId, parsed.data.cardId, parsed.data.knew);
  if (!result.ok) {
    if (result.reason === "not_found") return errorResponse(404, "not_found");
    return errorResponse(503, "save_failed");
  }
  try {
    await recordUserActivity(service, userId, "prep_review");
  } catch {
    // Seri ek bilgi; yanıt kaydedildi.
  }
  return NextResponse.json({ learned: result.learned, dueOn: result.dueOn });
}
