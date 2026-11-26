import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, guestLimit } from "@/lib/api/guards";
import { missingRelation } from "@/lib/learning/missing-column";
import { DUEL_MODERATION_COPY } from "@/lib/learning/duel-moderation";
import { HIDDEN_PLAYER_NAME, isOffensiveName } from "@/lib/moderation/display-name-filter";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const bodySchema = z.object({ runId: z.string().uuid() });

/**
 * Düello oyuncusunu engelle (26 Kasım 2026, mobil 1. adım; App Store 1.2). Yalnız oturumlu öğrenci engeller.
 * Hesaplı oyuncu kişi olarak engellenir (bütün düellolarda), misafir oyuncu yalnız o turuyla. Engellenen oyuncu
 * öğrencinin gördüğü sıralamalardan ve öğrencinin kurduğu düelloların sıralamasından çıkar (`duel-board.ts`).
 * Engel Ayarlar'dan kaldırılır (`/api/student/duel-blocks`).
 */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  let userId: string | null = null;
  try {
    const supabase = await createClient();
    userId = (await supabase.auth.getUser()).data.user?.id ?? null;
  } catch {
    userId = null;
  }
  if (!userId) {
    return NextResponse.json({ error: "auth_required", message: DUEL_MODERATION_COPY.signInToBlock }, { status: 401 });
  }
  const limited = await guestLimit(request, { scope: "duel-block", limit: 20, windowSeconds: 600, subject: `u:${userId}` });
  if (limited) return limited;

  const { code } = await params;
  if (!/^[a-z0-9]{6,16}$/.test(code)) return errorResponse(404, "not_found");
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const service = createServiceClient();
  const { data: duel } = await service.from("prep_duels").select("id").eq("share_code", code).maybeSingle();
  if (!duel) return errorResponse(404, "not_found");
  const { data: run } = await service
    .from("prep_duel_runs")
    .select("id, player_id, display_name")
    .eq("id", parsed.data.runId)
    .eq("duel_id", duel.id)
    .maybeSingle();
  if (!run) return errorResponse(404, "not_found");
  const playerId = (run.player_id as string | null) ?? null;
  if (playerId === userId) return errorResponse(400, "own_run");

  const name = String(run.display_name ?? "");
  const { error } = await service.from("duel_blocks").insert({
    blocker_id: userId,
    blocked_user_id: playerId,
    blocked_run_id: playerId ? null : run.id,
    blocked_name: (isOffensiveName(name) ? HIDDEN_PLAYER_NAME : name).slice(0, 40) || HIDDEN_PLAYER_NAME,
  });
  if (error && error.code !== "23505") {
    if (missingRelation(error)) {
      return NextResponse.json({ error: "blocks_unavailable", message: DUEL_MODERATION_COPY.unavailable }, { status: 503 });
    }
    console.error("duel_block_failed", { code: error.code });
    return errorResponse(500, "save_failed");
  }
  return NextResponse.json({ ok: true });
}
