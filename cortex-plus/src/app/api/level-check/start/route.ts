import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api/guards";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { poolUnit, UNIT_ID_PATTERN } from "@/lib/content-pool/keys";
import { GUEST_PREVIEW_COUNT, pickQuickScan, pickUnitCheck, poolIdFromSetupId } from "@/lib/level-check/select";
import { levelTablesReady, loadVerifiedItems, toLevelItem, toPick, unitCheckDone } from "@/lib/level-check/store";
import { createLevelToken } from "@/lib/level-check/token";
import type { LevelStartResponse } from "@/lib/level-check/types";

export const runtime = "nodejs";

const SETUP_ID = /^[a-z0-9-]{3,60}#\d{1,3}$/;
const bodySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("quick_scan"), units: z.array(z.string().regex(SETUP_ID)).min(1).max(400) }),
  z.object({ mode: z.literal("unit_check"), unit: z.string().regex(UNIT_ID_PATTERN), prepId: z.string().uuid() }),
]);

/**
 * Seviye kontrolü başlat (Plan PR 3). Yalnız havuzdaki doğrulanmış sorular; model çağrısı yok.
 * quick_scan: kurulum ağacı kimlikleri (0 tabanlı) → havuz kimliği; misafir yalnız 3 soru alır (ön izleme).
 * unit_check: oturum gerekir; ünite + hazırlık; daha önce yapıldıysa `done`.
 */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");
  const { data } = await (await createClient()).auth.getUser();
  const userId = data.user?.id ?? null;
  const service = createServiceClient();
  const body = parsed.data;
  const noStore = { "Cache-Control": "private, no-store" };

  if (body.mode === "unit_check") {
    if (!userId) return errorResponse(401, "unauthorized");
    const { data: prep } = await service.from("exam_preps").select("id").eq("id", body.prepId).eq("user_id", userId).maybeSingle();
    if (!prep) return errorResponse(404, "not_found");
    if (await unitCheckDone(service, userId, body.unit, body.prepId)) return NextResponse.json({ status: "done" } satisfies LevelStartResponse, { headers: noStore });
    const rows = await loadVerifiedItems(service, [body.unit]);
    const picked = pickUnitCheck(rows.map(toPick));
    if (!picked.length) return NextResponse.json({ status: "empty" } satisfies LevelStartResponse, { headers: noStore });
    return respond(picked.map((p) => rows.find((r) => r.id === p.id)!), "unit_check", userId, body.prepId);
  }

  const order = new Map<string, number>();
  for (const id of body.units) {
    const poolId = poolIdFromSetupId(id);
    if (poolId && !order.has(poolId)) order.set(poolId, order.size);
  }
  const units = [...order.entries()]
    .map(([unitId, i]) => ({ unitId, order: i, weight: poolUnit(unitId)?.outcomes.length ?? 0 }))
    .filter((u) => u.weight > 0);
  const rows = await loadVerifiedItems(service, units.map((u) => u.unitId));
  let picked = pickQuickScan(units, rows.map(toPick));
  if (!userId) picked = picked.slice(0, GUEST_PREVIEW_COUNT);
  if (!picked.length) return NextResponse.json({ status: "empty" } satisfies LevelStartResponse, { headers: noStore });
  return respond(picked.map((p) => rows.find((r) => r.id === p.id)!), "quick_scan", userId, null);

  async function respond(list: Awaited<ReturnType<typeof loadVerifiedItems>>, source: "quick_scan" | "unit_check", uid: string | null, prep: string | null) {
    const token = createLevelToken({ uid, src: source, items: list.map((r) => r.id), prep });
    if (!token) return errorResponse(503, "unconfigured");
    const persisted = uid ? await levelTablesReady(service) : false;
    const payload: LevelStartResponse = { status: "ok", token, source, guest: !uid, items: list.map(toLevelItem), persisted };
    return NextResponse.json(payload, { headers: noStore });
  }
}
