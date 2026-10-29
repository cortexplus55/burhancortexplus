import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, guestLimit } from "@/lib/api/guards";
import { createServiceClient } from "@/lib/supabase/server";
import type { DuelQuestion } from "@/lib/learning/duel";
import { BOT_LEVEL_IDS, botRun, botTimeline } from "@/lib/learning/duel-bot";

const bodySchema = z.object({ level: z.enum(BOT_LEVEL_IDS as [string, ...string[]]) });

/**
 * Bot rakip turu (29 Ekim 2026). Tur burada, doğru cevaplar bilinerek üretilir; istemciye soru başına
 * yalnız süre ve doğru/yanlış gider. Kayıt yok: bot sıralama tablosuna yazılmaz, yıldız da almaz.
 * Her istek yeni bir bot (tohum rastgele): "tekrar oyna" aynı botu getirmez.
 */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const limited = await guestLimit(request, { scope: "duel-bot", limit: 10 });
  if (limited) return limited;

  const { code } = await params;
  if (!/^[a-z0-9]{6,16}$/.test(code)) return errorResponse(404, "not_found");
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const service = createServiceClient();
  const { data: duel } = await service.from("prep_duels").select("id, questions").eq("share_code", code).maybeSingle();
  if (!duel) return errorResponse(404, "not_found");
  const questions = (Array.isArray(duel.questions) ? duel.questions : []) as DuelQuestion[];
  if (!questions.length) return errorResponse(404, "not_found");

  const run = botRun(questions, parsed.data.level as (typeof BOT_LEVEL_IDS)[number], `${duel.id}:${randomUUID()}`);
  return NextResponse.json(botTimeline(run));
}
