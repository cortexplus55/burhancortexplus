import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, guestLimit } from "@/lib/api/guards";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  DUEL_QUESTIONS,
  cleanDisplayName,
  scoreDuel,
  type DuelQuestion,
} from "@/lib/learning/duel";

const bodySchema = z.object({
  answers: z
    .array(
      z.object({
        choice: z.number().int().min(0).max(5).nullable(),
        ms: z.number().int().min(0).max(120_000),
      }),
    )
    .max(DUEL_QUESTIONS),
  name: z.string().max(60).optional(),
});

/**
 * Düello turu — hesapsız da oynanıyor (Astra: "hesap gerekmiyor").
 * Doğru cevaplar yalnızca burada, sunucuda; puan burada hesaplanıyor.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const limited = await guestLimit(request, { scope: "duel-run", limit: 10 });
  if (limited) return limited;

  const { code } = await params;
  if (!/^[a-z0-9]{6,16}$/.test(code)) return errorResponse(404, "not_found");

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const service = createServiceClient();
  const { data: duel } = await service
    .from("prep_duels")
    .select("id, questions")
    .eq("share_code", code)
    .maybeSingle();
  if (!duel) return errorResponse(404, "not_found");
  const questions = (Array.isArray(duel.questions) ? duel.questions : []) as DuelQuestion[];
  if (!questions.length) return errorResponse(404, "not_found");

  // Oturum varsa oyuncu o; yoksa misafir adı zorunlu.
  let playerId: string | null = null;
  let displayName = cleanDisplayName(parsed.data.name);
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      playerId = data.user.id;
      const { data: profile } = await service
        .from("profiles")
        .select("full_name")
        .eq("id", playerId)
        .maybeSingle();
      const first = String(profile?.full_name ?? "").trim().split(/\s+/)[0];
      displayName = cleanDisplayName(first) ?? displayName ?? "Öğrenci";
    }
  } catch {
    playerId = null;
  }
  if (!displayName) return errorResponse(400, "invalid_input");

  const result = scoreDuel(questions, parsed.data.answers);
  const { error } = await service.from("prep_duel_runs").insert({
    duel_id: duel.id,
    player_id: playerId,
    display_name: displayName,
    answers: parsed.data.answers,
    correct: result.correct,
    score: result.score,
  });
  if (error) return errorResponse(500, "save_failed");

  const [{ data: board }, { count: better }] = await Promise.all([
    service
      .from("prep_duel_runs")
      .select("display_name, score, correct, created_at")
      .eq("duel_id", duel.id)
      .order("score", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(10),
    service
      .from("prep_duel_runs")
      .select("id", { count: "exact", head: true })
      .eq("duel_id", duel.id)
      .gt("score", result.score),
  ]);

  return NextResponse.json({
    correct: result.correct,
    score: result.score,
    total: questions.length,
    answers: result.perQuestion.map((item) => item.answer),
    rank: (better ?? 0) + 1,
    leaderboard: (board ?? []).map((row) => ({
      name: row.display_name as string,
      score: row.score as number,
      correct: row.correct as number,
    })),
  });
}
