import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api/guards";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { recordResponse } from "@/lib/level-check/store";
import { LEVEL_TOKEN_TTL_MS, verifyLevelToken } from "@/lib/level-check/token";
import type { LevelAnswerResponse } from "@/lib/level-check/types";
import type { Difficulty } from "@/lib/level-check/mastery";

export const runtime = "nodejs";

const bodySchema = z.object({
  token: z.string().min(10).max(4000),
  itemId: z.string().uuid(),
  choice: z.number().int().min(0).max(9),
  timeMs: z.number().min(0).max(86_400_000),
});

/**
 * Sunucuda notlama: soru imzalı oturumda olmalı; cevap anahtarı ancak yanıt gelince döner.
 * Oturumlu öğrencide item_responses + outcome_mastery yazılır (tablolar yoksa yazma atlanır, `persisted:false`).
 * Misafir yanıtı hiçbir yere yazılmaz.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");
  const claims = verifyLevelToken(parsed.data.token);
  if (!claims || !claims.items.includes(parsed.data.itemId)) return errorResponse(403, "forbidden");
  const { data } = await (await createClient()).auth.getUser();
  const userId = data.user?.id ?? null;
  if ((claims.uid ?? null) !== userId) return errorResponse(403, "forbidden");

  const service = createServiceClient();
  const { data: item } = await service
    .from("item_bank")
    .select("id, unit_id, outcome_id, program_id, difficulty, answer, explanation")
    .eq("id", parsed.data.itemId)
    .eq("status", "verified")
    .maybeSingle();
  if (!item) return errorResponse(404, "not_found");
  const correct = Number(item.answer) === parsed.data.choice;
  const persisted = userId
    ? await recordResponse(service, {
        userId,
        item: { ...(item as { id: string; unit_id: string; outcome_id: string; program_id: string }), difficulty: item.difficulty as Difficulty },
        correct,
        timeMs: parsed.data.timeMs,
        source: claims.src,
        prepId: claims.prep,
        since: new Date(claims.exp - LEVEL_TOKEN_TTL_MS).toISOString(),
      })
    : false;
  const payload: LevelAnswerResponse = { correct, answer: Number(item.answer), explanation: String(item.explanation ?? ""), persisted };
  return NextResponse.json(payload, { headers: { "Cache-Control": "private, no-store" } });
}
