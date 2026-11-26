import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, guestLimit } from "@/lib/api/guards";
import { hashIp, requestIp } from "@/lib/abuse/record";
import { missingRelation } from "@/lib/learning/missing-column";
import { DUEL_MODERATION_COPY, DUEL_REPORT_REASONS, cleanReportNote } from "@/lib/learning/duel-moderation";
import { HIDDEN_PLAYER_NAME, isOffensiveName } from "@/lib/moderation/display-name-filter";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  runId: z.string().uuid(),
  reason: z.enum(DUEL_REPORT_REASONS),
  note: z.string().max(2000).optional(),
});

/**
 * Düello oyuncusunu bildir (26 Kasım 2026, mobil 1. adım; App Store 1.2). Misafir de bildirebilir (düello hesapsız
 * oynanıyor); misafirin kimliği IP'nin geri çevrilemez özeti. Aynı kişi aynı turu bir kez bildirir; ikinci bildirim
 * sessizce başarılı sayılır. Kişi kendi turunu bildiremez. İki ayrı kişiden "uygunsuz ad" gelince ad sıralamada
 * kendiliğinden gizlenir (`duel-board.ts`); karar yöneticide (`/admin/duello-bildirimleri`).
 */
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  let userId: string | null = null;
  try {
    const supabase = await createClient();
    userId = (await supabase.auth.getUser()).data.user?.id ?? null;
  } catch {
    userId = null;
  }
  const limited = await guestLimit(request, {
    scope: "duel-report",
    limit: 8,
    windowSeconds: 600,
    subject: userId ? `u:${userId}` : null,
  });
  if (limited) return limited;

  const { code } = await params;
  if (!/^[a-z0-9]{6,16}$/.test(code)) return errorResponse(404, "not_found");
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const reporterHash = userId ? null : hashIp(requestIp(request));
  if (!userId && !reporterHash) return errorResponse(400, "invalid_input");

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
  if (userId && run.player_id === userId) return errorResponse(400, "own_run");

  const name = String(run.display_name ?? "");
  const { error } = await service.from("duel_reports").insert({
    duel_id: duel.id,
    run_id: run.id,
    reporter_id: userId,
    reporter_hash: reporterHash,
    reported_user_id: (run.player_id as string | null) ?? null,
    reported_name: (isOffensiveName(name) ? HIDDEN_PLAYER_NAME : name).slice(0, 40) || HIDDEN_PLAYER_NAME,
    reason: parsed.data.reason,
    note: cleanReportNote(parsed.data.note),
  });
  if (error && error.code !== "23505") {
    if (missingRelation(error)) {
      return NextResponse.json({ error: "reports_unavailable", message: DUEL_MODERATION_COPY.unavailable }, { status: 503 });
    }
    console.error("duel_report_failed", { code: error.code });
    return errorResponse(500, "save_failed");
  }
  return NextResponse.json({ ok: true, message: DUEL_MODERATION_COPY.reported });
}
