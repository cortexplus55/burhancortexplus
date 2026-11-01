import { after, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { openaiLlm } from "@/lib/content-pool/generate";
import { getUnitContent } from "@/lib/content-pool/pool";
import { supabasePoolStore } from "@/lib/content-pool/supabase-store";
import { runFill } from "@/lib/content-pool/fill";
import { currentFillOrder, readFillConfig, sharedContentSpent, unitStates, writeFillConfig } from "@/lib/content-pool/fill-server";
import { adminUserId, cronAuthorized } from "@/lib/content-pool/fill-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Yeni ünite yalnız bu süre içinde başlatılır; başlayan ünite işlevin kalan ~3,5 dakikasında biter. */
const ADMIT_WINDOW_MS = 90_000;
const LEASE_MS = maxDuration * 1000 + 30_000;

/**
 * Ortak havuz toplu doldurucu. Hobby planında 5 dakikalık cron olmadığı için kendini zincirler:
 * her adım ~90 sn yeni ünite başlatır, bitince bir sonraki adımı CRON_SECRET ile çağırır.
 * Zincir; havuz dolunca, bütçe tavanına gelince ya da kill switch kapanınca kendiliğinden durur.
 *
 * GET  (Authorization: Bearer CRON_SECRET) → bir adım.
 * POST (yönetici oturumu) {action:"start"|"stop"} → kill switch'i açar (başlatanı maliyet sahibi yapar) ve ilk adımı başlatır / kapatır.
 */
export async function GET(request: Request) {
  if (cronAuthorized(request)) return step(new URL(request.url).origin);
  // Yönetici tarayıcıdan da açabilir: ?action=start | stop.
  const action = new URL(request.url).searchParams.get("action");
  if (action === "start" || action === "stop") return control(request, action);
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  return control(request, body.action === "stop" ? "stop" : "start");
}

async function control(request: Request, action: "start" | "stop") {
  const userId = await adminUserId();
  if (!userId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const service = createServiceClient();
  if (action === "stop") {
    await writeFillConfig(service, { enabled: false, metadata: { lease_until: null } });
    return NextResponse.json({ ok: true, enabled: false });
  }
  await writeFillConfig(service, { enabled: true, metadata: { actor_user_id: userId } });
  return step(new URL(request.url).origin);
}

async function step(origin: string) {
  const service = createServiceClient();
  const config = await readFillConfig(service);
  if (!config.enabled) return NextResponse.json({ ok: true, skipped: "disabled" });
  if (!config.actorUserId) return NextResponse.json({ ok: false, skipped: "no_actor" }, { status: 409 });
  if (config.leaseUntil > Date.now()) return NextResponse.json({ ok: true, skipped: "running" }, { status: 202 });
  const llm = openaiLlm();
  if (!llm) return NextResponse.json({ ok: false, skipped: "ai_not_configured" }, { status: 503 });
  const leaseUntil = new Date(Date.now() + LEASE_MS).toISOString();
  await writeFillConfig(service, { metadata: { lease_until: leaseUntil } });

  const started = Date.now();
  const actor = config.actorUserId;
  after(async () => {
    const store = supabasePoolStore(service);
    let report;
    try {
      report = await runFill(
        currentFillOrder(),
        {
          states: (ids) => unitStates(service, ids),
          spent: () => sharedContentSpent(service),
          enabled: async () => (await readFillConfig(service)).enabled,
          run: async (unitId) => (await getUnitContent(unitId, { store, llm, userId: actor })).status,
          now: Date.now,
          log: (event, data) => console.warn(event, data),
        },
        { capUsd: config.capUsd, unitEstimateUsd: config.unitEstimateUsd, concurrency: config.concurrency, deadline: started + ADMIT_WINDOW_MS },
      );
    } catch (error) {
      console.error("pool_fill_error", String(error).slice(0, 300));
      await writeFillConfig(service, { metadata: { lease_until: null, last_run: { at: new Date().toISOString(), error: String(error).slice(0, 200) } } });
      return;
    }
    const lastRun = { at: new Date().toISOString(), ms: Date.now() - started, ...report, done: report.done.length, pending: report.pending.length, failedUnits: report.failed, skippedFailed: report.skippedFailed.length };
    await writeFillConfig(service, { metadata: { lease_until: null, last_run: lastRun } });
    console.warn("pool_fill_step", lastRun);
    const more = report.stop === "deadline" || (report.stop === "complete" && report.pending.length > 0 && report.done.length > 0);
    const secret = process.env.CRON_SECRET;
    if (more && secret) {
      await fetch(`${origin}/api/cron/content-pool-fill`, { headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(20_000) }).catch(() => undefined);
    }
  });
  const spent = await sharedContentSpent(service);
  const states = await unitStates(service, currentFillOrder().map((t) => t.unitId)).catch(() => new Map());
  return NextResponse.json({ ok: true, started: true, leaseUntil, spentUsd: Number(spent.toFixed(4)), capUsd: config.capUsd, verifiedUnits: [...states.values()].filter((s) => s.verified).length }, { status: 202 });
}
