import { after, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { openaiLlm, regenerateLesson } from "@/lib/content-pool/generate";
import { poolUnit } from "@/lib/content-pool/keys";
import { supabasePoolStore } from "@/lib/content-pool/supabase-store";
import { readFillConfig, sharedContentSpent } from "@/lib/content-pool/fill-server";
import { adminUserId, cronAuthorized } from "@/lib/content-pool/fill-auth";
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
 */
const FLAG = "content_pool_refresh";
const ADMIT_MS = 200_000;
const LESSON_ESTIMATE_USD = 0.008;

export async function GET(request: Request) {
  if (cronAuthorized(request)) return step(new URL(request.url).origin);
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export async function POST(request: Request) {
  const userId = await adminUserId();
  if (!userId) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { action?: string };
  const service = createServiceClient();
  const enabled = body.action !== "stop";
  await service.from("feature_flags").upsert(
    { key: FLAG, enabled, description: "Havuz dersleri kalite rubriği yenilemesi (yalnız anlatım)", metadata: { actor_user_id: userId }, updated_at: new Date().toISOString() },
    { onConflict: "key" },
  );
  if (!enabled) return NextResponse.json({ ok: true, enabled: false });
  return step(new URL(request.url).origin);
}

async function readFlag(service: ReturnType<typeof createServiceClient>) {
  const { data } = await service.from("feature_flags").select("enabled, metadata").eq("key", FLAG).maybeSingle();
  const metadata = ((data?.metadata as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
  return { enabled: Boolean(data?.enabled), actor: typeof metadata.actor_user_id === "string" ? metadata.actor_user_id : null, metadata };
}

async function step(origin: string) {
  const service = createServiceClient();
  const flag = await readFlag(service);
  if (!flag.enabled || !flag.actor) return NextResponse.json({ ok: true, skipped: "disabled" });
  const llm = openaiLlm();
  if (!llm) return NextResponse.json({ ok: false, skipped: "ai_not_configured" }, { status: 503 });
  const { data } = await service.from("topic_content").select("id, unit_id, body, qa").eq("kind", "lesson").eq("status", "verified").limit(2000);
  const weak = weakLessons((data ?? []) as RefreshRow[]);
  const cap = (await readFillConfig(service)).capUsd;
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
    const finished = report.stop !== "deadline";
    await service
      .from("feature_flags")
      .update({ ...(finished ? { enabled: false } : {}), metadata: { ...flag.metadata, last_run: { at: new Date().toISOString(), ms: Date.now() - started, ...report } }, updated_at: new Date().toISOString() })
      .eq("key", FLAG);
    console.warn("pool_refresh_step", report);
    const secret = process.env.CRON_SECRET;
    if (!finished && secret)
      await fetch(`${origin}/api/cron/content-pool-refresh`, { headers: { Authorization: `Bearer ${secret}` }, cache: "no-store", signal: AbortSignal.timeout(15_000) }).catch(() => undefined);
  });
  return NextResponse.json({ ok: true, started: true, weak: weak.length, spentUsd: Number((await sharedContentSpent(service)).toFixed(4)), capUsd: cap }, { status: 202 });
}
