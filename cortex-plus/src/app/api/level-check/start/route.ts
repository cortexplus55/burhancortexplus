import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api/guards";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { poolUnit, UNIT_ID_PATTERN } from "@/lib/content-pool/keys";
import { GUEST_PREVIEW_COUNT, pickQuickScan, pickUnitCheck, poolIdFromSetupId } from "@/lib/level-check/select";
import { encodeOrder, levelChoiceOrders, levelTablesReady, loadVerifiedItems, toLevelItem, toPick, unitCheckDone } from "@/lib/level-check/store";
import { createLevelToken } from "@/lib/level-check/token";
import type { LevelStartResponse, MissingOutcome } from "@/lib/level-check/types";
import { loadAnsweredItems, loadMasteryStates, plannedPoolUnits } from "@/lib/mastery-map/load";
import { reinforceOffer, pickReinforcement } from "@/lib/mastery-map/reinforce";
import { PRIOR } from "@/lib/level-check/mastery";
import { poolBudgetAllows } from "@/lib/content-pool/fill-server";
import { createReinforceItems, REINFORCE_DAILY_LIMIT, REINFORCE_TARGET, reinforceNewStep, reinforceAllowedForFree, reinforceUsedToday } from "@/lib/content-pool/reinforce-new";

export const runtime = "nodejs";
// reinforce_new tek kazanıma soru yazar ve kör çözer (2 model çağrısı).
export const maxDuration = 90;

const SETUP_ID = /^[a-z0-9-]{3,60}#\d{1,3}$/;
const bodySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("quick_scan"), units: z.array(z.string().regex(SETUP_ID)).min(1).max(400) }),
  z.object({ mode: z.literal("unit_check"), unit: z.string().regex(UNIT_ID_PATTERN), prepId: z.string().uuid() }),
  z.object({ mode: z.literal("reinforce"), unit: z.string().regex(UNIT_ID_PATTERN), prepId: z.string().uuid(), peek: z.boolean().optional() }),
  z.object({ mode: z.literal("reinforce_new"), unit: z.string().regex(UNIT_ID_PATTERN), prepId: z.string().uuid(), code: z.string().min(1).max(40), fill: z.boolean().optional() }),
]);

const REINFORCE_NEW_COUNT = REINFORCE_TARGET;
/** Bir yeni pekiştirme üretiminin (yazar + kör çözücü) üst tahmini; tavan denetimi için. */
const REINFORCE_ESTIMATE_USD = 0.03;

/**
 * Seviye kontrolü başlat (Plan PR 3). Yalnız havuzdaki doğrulanmış sorular; model çağrısı yok.
 * quick_scan: kurulum ağacı kimlikleri (0 tabanlı) → havuz kimliği; misafir yalnız 3 soru alır (ön izleme).
 * unit_check: oturum gerekir; ünite + hazırlık; daha önce yapıldıysa `done`.
 * reinforce (PR 4): oturum + hazırlık; ünitenin zayıf kazanımları (≥1 yanıt, ustalık < 0,5) için daha önce
 * yanıtlanmamış en çok 2 soru (önce kolay/orta). Ek sorusu olmayan kazanım `missing` ile dürüstçe bildirilir.
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

  if (body.mode === "reinforce_new") {
    if (!userId) return errorResponse(401, "unauthorized");
    const { data: prep } = await service.from("exam_preps").select("id, learning_preferences").eq("id", body.prepId).eq("user_id", userId).maybeSingle();
    if (!prep) return errorResponse(404, "not_found");
    const unit = poolUnit(body.unit);
    const outcome = unit?.outcomes.find((o) => o.code === body.code);
    if (!unit || !outcome) return errorResponse(404, "not_found");
    const planned = plannedPoolUnits(prep.learning_preferences).find((p) => p.poolId === body.unit);
    const allowed = await reinforceAllowedForFree(service, { userId, prepId: body.prepId, unitTitle: planned?.title ?? unit.unit.title, order: planned?.order ?? null });
    if (!allowed) return NextResponse.json({ status: "locked" } satisfies LevelStartResponse, { headers: noStore });
    const [answered, rows] = await Promise.all([loadAnsweredItems(service, userId, [body.unit]), loadVerifiedItems(service, [body.unit])]);
    const mine = rows.filter((r) => r.outcome_id === outcome.outcomeId);
    // Read-through: havuzda bu kazanımın yanıtlanmamış sorusu varsa önce o (model çağrısı yok, sınırdan düşmez).
    // Havuzda hedeften (5) az görülmemiş soru varsa: önce onlar anında, `more` ile istemci kalanı arkada üretir (fill).
    const ready = mine.filter((r) => !answered.has(r.id)).slice(0, REINFORCE_NEW_COUNT);
    const step = reinforceNewStep(ready.length, body.fill === true);
    if (step.serveReady) return respond(ready, "practice", userId, body.prepId, undefined, step.more);
    const used = await reinforceUsedToday(service, userId);
    if (used === null) return NextResponse.json({ status: "unavailable" } satisfies LevelStartResponse, { headers: noStore });
    if (used >= REINFORCE_DAILY_LIMIT) return NextResponse.json({ status: "limit", limit: REINFORCE_DAILY_LIMIT } satisfies LevelStartResponse, { headers: noStore });
    // Ortak havuz tavanı (Paket 3b): dolduysa yeni üretim yok, öğrenciye sakin mesaj.
    if (!(await poolBudgetAllows(service, REINFORCE_ESTIMATE_USD))) return NextResponse.json({ status: "paused" } satisfies LevelStartResponse, { headers: noStore });
    const made = await createReinforceItems(service, { unit, outcomeCode: outcome.code, userId, existingStems: mine.map((r) => String(r.stem ?? "")) });
    if (made.state !== "ok") return NextResponse.json({ status: made.state === "none" ? "empty" : "unavailable" } satisfies LevelStartResponse, { headers: noStore });
    const fresh = (await loadVerifiedItems(service, [body.unit])).filter((r) => made.ids.includes(r.id));
    if (!fresh.length) return NextResponse.json({ status: "unavailable" } satisfies LevelStartResponse, { headers: noStore });
    return respond(fresh, "practice", userId, body.prepId);
  }

  if (body.mode === "reinforce") {
    if (!userId) return errorResponse(401, "unauthorized");
    const { data: prep } = await service
      .from("exam_preps")
      .select("id, learning_preferences")
      .eq("id", body.prepId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!prep) return errorResponse(404, "not_found");
    const planned = plannedPoolUnits(prep.learning_preferences).find((p) => p.poolId === body.unit);
    const outcomes = planned?.outcomes ?? poolUnit(body.unit)?.outcomes ?? [];
    const states = await loadMasteryStates(service, userId, outcomes.map((o) => o.outcomeId));
    if (!states) return NextResponse.json({ status: "empty", weakCount: 0 } satisfies LevelStartResponse, { headers: noStore });
    const [answered, rows] = await Promise.all([loadAnsweredItems(service, userId, [body.unit]), loadVerifiedItems(service, [body.unit])]);
    const inputs = outcomes.map((o) => ({ outcomeId: o.outcomeId, state: states.get(o.outcomeId) ?? PRIOR }));
    const view = (id: string) => {
      const o = outcomes.find((x) => x.outcomeId === id);
      return { code: o?.code ?? "", text: o?.text ?? "" };
    };
    if (body.peek) {
      const r = reinforceOffer(inputs, rows.map(toPick), answered);
      return NextResponse.json(
        {
          status: "offer",
          offer: r.offer.map((o) => ({ ...view(o.outcomeId), count: o.count })),
          total: r.total,
          weakCount: r.weak.length,
          missing: r.missing.map(view),
        } satisfies LevelStartResponse,
        { headers: noStore },
      );
    }
    const { picked, weak, missing } = pickReinforcement(inputs, rows.map(toPick), answered);
    const missingView: MissingOutcome[] = missing.map(view);
    if (!picked.length) return NextResponse.json({ status: "empty", missing: missingView, weakCount: weak.length } satisfies LevelStartResponse, { headers: noStore });
    return respond(picked.map((p) => rows.find((r) => r.id === p.id)!), "practice", userId, body.prepId, missingView);
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

  async function respond(
    list: Awaited<ReturnType<typeof loadVerifiedItems>>,
    source: "quick_scan" | "unit_check" | "practice",
    uid: string | null,
    prep: string | null,
    missing?: MissingOutcome[],
    more?: boolean,
  ) {
    // Şıklar oturumun bütününde dengelenir (6 Kasım 2026, Paket 2); sıra imzalı belirteçte, notlama oradan çevirir.
    const [orders, persisted] = await Promise.all([
      levelChoiceOrders(service, list, `${source}:${uid ?? "guest"}:${prep ?? ""}:${Date.now()}`),
      uid ? levelTablesReady(service) : Promise.resolve(false),
    ]);
    const token = createLevelToken({
      uid,
      src: source,
      items: list.map((r) => r.id),
      prep,
      ...(orders ? { ord: orders.map(encodeOrder) } : {}),
    });
    if (!token) return errorResponse(503, "unconfigured");
    const items = list.map((r, index) => toLevelItem(r, orders?.[index] ?? null));
    const payload: LevelStartResponse = { status: "ok", token, source, guest: !uid, items, persisted, ...(missing ? { missing } : {}), ...(more ? { more: true } : {}) };
    return NextResponse.json(payload, { headers: noStore });
  }
}
