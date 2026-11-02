import { after, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { openaiLlm, regenerateLesson } from "@/lib/content-pool/generate";
import { poolUnit } from "@/lib/content-pool/keys";
import { supabasePoolStore } from "@/lib/content-pool/supabase-store";
import { readFillConfig, sharedContentSpent } from "@/lib/content-pool/fill-server";
import { adminUserId, cronAuthorized, resumeTokenAuthorized } from "@/lib/content-pool/fill-auth";
import { runRefresh, weakLessons, type RefreshRow } from "@/lib/content-pool/refresh";
import { RUBRIC_VERSION } from "@/lib/content-pool/rubric";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Zayıf havuz derslerini kalite rubriğine göre yeniden yazar — YALNIZ anlatım; sorular (item_bank) dokunulmaz.
 * Doldurucudan ayrı: kendi kill switch'i feature_flags.key = content_pool_refresh (satırı başlatma yazar; migration yok).
 * Bütçe tavanı doldurucuyla ortak (content_pool_fill.cap_usd, toplam SHARED_CONTENT%). Doldurucu yalnız doğrulanmamış
 * üniteleri ürettiği, bu yol yalnız doğrulanmış dersleri güncellediği için ikisi aynı satıra yazmaz.
 *
 * POST (yönetici oturumu) {action:"start"|"stop"}; GET (Bearer CRON_SECRET) → bir adım (zincir).
 * GET ?action=resume (x-pool-resume-token; sha256'sı bu bayrağın metadata.resume_token_sha256'sı) → pg_cron güvenlik ağı.
 * Aynı anda tek adım: metadata.lease_until (compare-and-set); kilit doluysa adım atlanır.
 */
const FLAG = "content_pool_refresh";
const ADMIT_MS = 200_000;
const LESSON_ESTIMATE_USD = 0.011; // pilot (2 Kasım 2026): ders başı ölçülen 0.0108 $

export async function GET(request: Request) {
  if (cronAuthorized(request)) return step(new URL(request.url).origin);
  if (new URL(request.url).searchParams.get("action") === "resume") {
    const flag = await readFlag(createServiceClient());
    if (resumeTokenAuthorized(request, flag.metadata.resume_token_sha256)) return step(new URL(request.url).origin);
  }
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export async function POST(request: Request) {
  const userId = await adminUserId();
  if (!userId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  const service = createServiceClient();
  const enabled = body.action !== "stop";
  await service.from("feature_flags").upsert(
    { key: FLAG, enabled, description: "Havuz dersleri kalite rubriği yenilemesi (yalnız anlatım)", metadata: { ...(await readFlag(service)).metadata, actor_user_id: userId, lease_until: null }, updated_at: new Date().toISOString() },
    { onConflict: "key" },
  );
  if (!enabled) return NextResponse.json({ ok: true, enabled: false });
  return step(new URL(request.url).origin);
}

async function readFlag(service: ReturnType<typeof createServiceClient>) {
  const { data } = await service.from("feature_flags").select("enabled, metadata, updated_at").eq("key", FLAG).maybeSingle();
  const metadata = ((data?.metadata as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
  return {
    enabled: Boolean(data?.enabled),
    actor: typeof metadata.actor_user_id === "string" ? metadata.actor_user_id : null,
    metadata,
    updatedAt: (data?.updated_at as string | undefined) ?? null,
  };
}

/** Kilit (compare-and-set, doldurucudaki acquireLease ile aynı). */
async function acquire(service: ReturnType<typeof createServiceClient>, flag: Awaited<ReturnType<typeof readFlag>>) {
  const current = typeof flag.metadata.lease_until === "string" ? Date.parse(flag.metadata.lease_until) || 0 : 0;
  if (current > Date.now() || !flag.updatedAt) return null;
  const metadata = { ...flag.metadata, lease_until: new Date(Date.now() + 330_000).toISOString() };
  const { data } = await service
    .from("feature_flags")
    .update({ metadata, updated_at: new Date().toISOString() })
    .eq("key", FLAG)
    .eq("updated_at", flag.updatedAt)
    .select("key");
  return data && data.length === 1 ? metadata : null;
}

async function step(origin: string) {
  const service = createServiceClient();
  const flag = await readFlag(service);
  if (!flag.enabled || !flag.actor) return NextResponse.json({ ok: true, skipped: "disabled" });
  const llm = openaiLlm();
  if (!llm) return NextResponse.json({ ok: false, skipped: "ai_not_configured" }, { status: 503 });
  // Öncelik doldurucuda: doldurucu çalışıyorsa (açık + kilidi geçerli) bu adım hiç başlamaz, cron sonra dener.
  const fillerBusy = async () => {
    const fill = await readFillConfig(service);
    return fill.enabled && fill.leaseUntil > Date.now();
  };
  if (await fillerBusy()) return NextResponse.json({ ok: true, skipped: "filler_running" }, { status: 202 });
  const leased = await acquire(service, flag);
  if (!leased) return NextResponse.json({ ok: true, skipped: "running" }, { status: 202 });
  const pilot = typeof flag.metadata.pilot_limit === "number" ? flag.metadata.pilot_limit : null;
  const { data } = await service.from("topic_content").select("id, unit_id, body, qa").eq("kind", "lesson").eq("status", "verified").limit(2000);
  const allWeak = weakLessons((data ?? []) as RefreshRow[]);
  // Pilot: metadata.pilot_limit verilirse yalnız o kadar ders yenilenir, sonra iş kapanır.
  const weak = pilot === null ? allWeak : allWeak.slice(0, Math.max(0, pilot));
  // Ortak tavan doldurucunun; metadata.stop_usd verilirse yenileme daha erken durur (video/podcast payı).
  const fillCap = (await readFillConfig(service)).capUsd;
  const stopUsd = Number(flag.metadata.stop_usd);
  const cap = Number.isFinite(stopUsd) && stopUsd > 0 ? Math.min(fillCap, stopUsd) : fillCap;
  const actor = flag.actor;
  const started = Date.now();
  after(async () => {
    const store = supabasePoolStore(service);
    const report = await runRefresh(
      weak,
      {
        spent: () => sharedContentSpent(service),
        enabled: async () => (await readFlag(service)).enabled,
        now: Date.now,
        yieldTo: fillerBusy,
        refresh: async (row) => {
          const unit = poolUnit(row.unit_id);
          const qa = row.qa ?? {};
          if (!unit) {
            await service.from("topic_content").update({ qa: { ...qa, rubric_refresh: { failed_at: new Date().toISOString(), issues: ["unit_not_found"] } } }).eq("id", row.id);
            return false;
          }
          const out = await regenerateLesson(unit, llm);
          await store.recordUsage(actor, out.usage).catch(() => undefined);
          const at = new Date().toISOString();
          if (!out.lesson) {
            await service.from("topic_content").update({ qa: { ...qa, rubric_refresh: { failed_at: at, issues: out.issues.slice(0, 20) } } }).eq("id", row.id);
            return false;
          }
          const { error } = await service
            .from("topic_content")
            .update({ body: out.lesson, qa: { ...qa, rubric: RUBRIC_VERSION, rubric_refresh: { at, previous_title: row.body.title } } })
            .eq("id", row.id)
            .eq("status", "verified");
          return !error;
        },
      },
      { capUsd: cap, lessonEstimateUsd: LESSON_ESTIMATE_USD, concurrency: 3, deadline: started + ADMIT_MS },
    );
    const finished = (report.stop !== "deadline" && report.stop !== "yield") || pilot !== null;
    const latest = (await readFlag(service)).metadata;
    await service
      .from("feature_flags")
      .update({ ...(finished ? { enabled: false } : {}), metadata: { ...latest, ...(pilot !== null ? { pilot_limit: null } : {}), lease_until: null, last_run: { at: new Date().toISOString(), ms: Date.now() - started, ...report } }, updated_at: new Date().toISOString() })
      .eq("key", FLAG);
    console.warn("pool_refresh_step", report);
    const secret = process.env.CRON_SECRET;
    if (!finished && report.stop === "deadline" && secret)
      await fetch(`${origin}/api/cron/content-pool-refresh`, { headers: { Authorization: `Bearer ${secret}` }, cache: "no-store", signal: AbortSignal.timeout(15_000) }).catch(() => undefined);
  });
  return NextResponse.json({ ok: true, started: true, weak: weak.length, spentUsd: Number((await sharedContentSpent(service)).toFixed(4)), capUsd: cap }, { status: 202 });
}
