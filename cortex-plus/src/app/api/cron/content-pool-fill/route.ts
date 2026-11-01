import { after, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { openaiLlm } from "@/lib/content-pool/generate";
import { getUnitContent } from "@/lib/content-pool/pool";
import { supabasePoolStore } from "@/lib/content-pool/supabase-store";
import { runFill } from "@/lib/content-pool/fill";
import { acquireLease, currentFillOrder, readFillConfig, sharedContentSpent, unitStates, writeFillConfig } from "@/lib/content-pool/fill-server";
import { adminUserId, cronAuthorized, resumeTokenAuthorized } from "@/lib/content-pool/fill-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Yeni ünite yalnız adımın ilk 20 sn'sinde başlatılır (tek dalga). Ölçüm (1 Kasım 2026): bir ünite ~250 sn;
 * daha geç başlayan ünite 300 sn sınırında kesilirdi. Adım biter bitmez sonraki adım çağrılır, arada boşluk yok.
 */
const ADMIT_WINDOW_MS = 20_000;
const LEASE_MS = maxDuration * 1000 + 30_000;

/**
 * Ortak havuz toplu doldurucu. Hobby planında 5 dakikalık cron olmadığı için kendini zincirler:
 * her adım ~90 sn yeni ünite başlatır, bitince bir sonraki adımı CRON_SECRET ile çağırır.
 * Zincir; havuz dolunca, bütçe tavanına gelince ya da kill switch kapanınca kendiliğinden durur.
 *
 * GET  (Authorization: Bearer CRON_SECRET) → bir adım.
 * GET ?action=resume (x-pool-resume-token) → zamanlayıcı güvenlik ağı: zincir koparsa kilit boş/süresi dolmuşken bir adım.
 * POST (yönetici oturumu) {action:"start"|"stop"} → kill switch'i açar (başlatanı maliyet sahibi yapar) ve ilk adımı başlatır / kapatır.
 */
export async function GET(request: Request) {
  if (cronAuthorized(request)) return step(new URL(request.url).origin);
  // Yönetici tarayıcıdan da açabilir: ?action=start | stop.
  const action = new URL(request.url).searchParams.get("action");
  if (action === "resume") {
    const config = await readFillConfig(createServiceClient());
    if (resumeTokenAuthorized(request, config.metadata.resume_token_sha256)) return step(new URL(request.url).origin);
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
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
  const leaseUntil = await acquireLease(service, LEASE_MS);
  if (!leaseUntil) return NextResponse.json({ ok: true, skipped: "running" }, { status: 202 });

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
    // Bitti ya da tavana gelindi: kill switch kapanır, zamanlayıcı boşuna tetiklemez.
    const finished = report.stop === "budget" || (report.stop === "complete" && report.remaining === 0 && report.pending.length === 0 && report.done.length === 0);
    const lastRun = { at: new Date().toISOString(), ms: Date.now() - started, ...report, done: report.done.length, pending: report.pending.length, failedUnits: report.failed, skippedFailed: report.skippedFailed.length };
    await writeFillConfig(service, { ...(finished ? { enabled: false } : {}), metadata: { lease_until: null, last_run: lastRun } });
    console.warn("pool_fill_step", lastRun);
    const more = report.stop === "deadline" || (report.stop === "complete" && report.pending.length > 0 && report.done.length > 0);
    const secret = process.env.CRON_SECRET;
    if (more && secret) await dispatchNext(service, origin, secret);
  });
  const spent = await sharedContentSpent(service);
  const states = await unitStates(service, currentFillOrder().map((t) => t.unitId)).catch(() => new Map());
  return NextResponse.json({ ok: true, started: true, leaseUntil, spentUsd: Number(spent.toFixed(4)), capUsd: config.capUsd, verifiedUnits: [...states.values()].filter((s) => s.verified).length }, { status: 202 });
}

/**
 * Sonraki adımı çağırır ve onay (2xx) bekler; başarısızsa kısa aralarla yeniden dener. Sonuç last_dispatch'e yazılır.
 * Eskiden hata sessizce yutuluyordu: tek istek düşünce zincir sessizce ölüyordu. Yine de düşerse ?action=resume zamanlayıcısı devralır.
 */
async function dispatchNext(service: ReturnType<typeof createServiceClient>, origin: string, secret: string) {
  let status = 0;
  let error: string | null = null;
  let attempts = 0;
  for (; attempts < 3; attempts++) {
    if (attempts) await new Promise((r) => setTimeout(r, 2_000 * attempts));
    try {
      const res = await fetch(`${origin}/api/cron/content-pool-fill`, { headers: { Authorization: `Bearer ${secret}` }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
      status = res.status;
      error = null;
      if (res.ok) break;
    } catch (e) {
      error = String(e).slice(0, 120);
    }
  }
  const lastDispatch = { at: new Date().toISOString(), status, attempts: Math.min(attempts + 1, 3), ok: status >= 200 && status < 300, error };
  if (!lastDispatch.ok) console.error("pool_fill_dispatch_failed", lastDispatch);
  await writeFillConfig(service, { metadata: { last_dispatch: lastDispatch } }).catch(() => undefined);
}
