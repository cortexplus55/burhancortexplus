import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CURRICULUM } from "@/lib/curriculum/registry";
import { CONTENT_VERSION } from "@/lib/content-pool/keys";
import { GATE_VERSION } from "@/lib/content-pool/gate";
import { DEFAULT_CAP_USD, DEFAULT_UNIT_ESTIMATE_USD, fillOrder, MAX_FAILED_ATTEMPTS, type FillTarget, type UnitState } from "@/lib/content-pool/fill";

/**
 * Ayar ve kill switch tek satırda: feature_flags.key = content_pool_fill (yeni tablo/migration yok).
 * enabled=false ya da satır yoksa doldurucu hiçbir şey üretmez. metadata:
 *   cap_usd (toplam SHARED_CONTENT tavanı, varsayılan 5.33), unit_estimate_usd, concurrency (1–3),
 *   actor_user_id (maliyetin yazılacağı kurucu; başlatan yönetici), lease_until (ISO, zincir kilidi).
 */
export const FILL_FLAG = "content_pool_fill";

export type FillConfig = { enabled: boolean; capUsd: number; unitEstimateUsd: number; concurrency: number; actorUserId: string | null; leaseUntil: number; metadata: Record<string, unknown> };

const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fallback);

export async function readFillConfig(service: SupabaseClient): Promise<FillConfig> {
  const { data } = await service.from("feature_flags").select("enabled, metadata").eq("key", FILL_FLAG).maybeSingle();
  const metadata = ((data?.metadata as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
  return {
    enabled: Boolean(data?.enabled),
    capUsd: num(metadata.cap_usd, DEFAULT_CAP_USD),
    unitEstimateUsd: num(metadata.unit_estimate_usd, DEFAULT_UNIT_ESTIMATE_USD),
    concurrency: Math.min(3, Math.max(1, Math.round(num(metadata.concurrency, 3)))),
    actorUserId: typeof metadata.actor_user_id === "string" ? metadata.actor_user_id : null,
    leaseUntil: typeof metadata.lease_until === "string" ? Date.parse(metadata.lease_until) || 0 : 0,
    metadata,
  };
}

/**
 * Yalnız verilen alanları yazar. `enabled` verilmezse satır varken dokunulmaz: adımın kendi yazımı
 * (lease, last_run) kurucunun elle kapattığı kill switch'i geri açamaz.
 */
export async function writeFillConfig(service: SupabaseClient, patch: { enabled?: boolean; metadata?: Record<string, unknown> }): Promise<void> {
  const { data: row } = await service.from("feature_flags").select("metadata").eq("key", FILL_FLAG).maybeSingle();
  if (row) {
    const metadata = { ...((row.metadata as Record<string, unknown> | null) ?? {}), ...(patch.metadata ?? {}) };
    await service
      .from("feature_flags")
      .update({ ...(patch.enabled === undefined ? {} : { enabled: patch.enabled }), metadata, updated_at: new Date().toISOString() })
      .eq("key", FILL_FLAG);
    return;
  }
  const current = await readFillConfig(service);
  await service.from("feature_flags").upsert(
    {
      key: FILL_FLAG,
      enabled: patch.enabled ?? current.enabled,
      description: "Ortak içerik havuzu toplu doldurucu (kill switch + bütçe tavanı)",
      metadata: { ...current.metadata, ...(patch.metadata ?? {}) },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
}

/**
 * Tek çalıştırma kilidi (compare-and-set): satırın updated_at'i okunduğu andaki değerle eşleşirse ve kilit boş/süresi
 * dolmuşsa yazılır. Aynı anda gelen iki tetik (zincir + zamanlayıcı + elle başlatma) yalnız birini çalıştırır.
 */
export async function acquireLease(service: SupabaseClient, leaseMs: number, now = Date.now()): Promise<string | null> {
  const { data: row } = await service.from("feature_flags").select("enabled, metadata, updated_at").eq("key", FILL_FLAG).maybeSingle();
  if (!row?.enabled) return null;
  const metadata = ((row.metadata as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
  const current = typeof metadata.lease_until === "string" ? Date.parse(metadata.lease_until) || 0 : 0;
  if (current > now) return null;
  const leaseUntil = new Date(now + leaseMs).toISOString();
  const { data } = await service
    .from("feature_flags")
    .update({ metadata: { ...metadata, lease_until: leaseUntil, step_started_at: new Date(now).toISOString() }, updated_at: new Date(now).toISOString() })
    .eq("key", FILL_FLAG)
    .eq("updated_at", row.updated_at as string)
    .select("key");
  return data && data.length === 1 ? leaseUntil : null;
}

export function currentFillOrder(): FillTarget[] {
  return fillOrder(CURRICULUM.programs);
}

/** Toplam SHARED_CONTENT harcaması (bütçe ölçüsü). Okunamazsa sonsuz: doldurucu güvenli tarafta durur. */
export async function sharedContentSpent(service: SupabaseClient): Promise<number> {
  let total = 0;
  for (let from = 0; ; from += 1000) {
    const { data, error } = await service
      .from("ai_usage_events")
      .select("cost_usd_estimate")
      .like("action_code", "SHARED_CONTENT%")
      .range(from, from + 999);
    if (error) return Number.POSITIVE_INFINITY;
    for (const row of data ?? []) total += Number(row.cost_usd_estimate ?? 0);
    if (!data || data.length < 1000) return total;
  }
}

type Row = { unit_id: string; status: string; qa: { reason?: string; gate_version?: number } | null };

/** Ünite başına durum: doğrulanmış mı, kaç gerçek başarısızlık (terk edilmiş kilit sayılmaz). */
export async function unitStates(service: SupabaseClient, unitIds: string[]): Promise<Map<string, UnitState & { draft: boolean }>> {
  const out = new Map<string, UnitState & { draft: boolean }>();
  for (let i = 0; i < unitIds.length; i += 200) {
    const { data, error } = await service
      .from("topic_content")
      .select("unit_id, status, qa")
      .eq("kind", "lesson")
      .eq("version", CONTENT_VERSION)
      .in("unit_id", unitIds.slice(i, i + 200));
    if (error) throw new Error(`topic_content states: ${error.message}`);
    for (const row of (data ?? []) as Row[]) {
      const s = out.get(row.unit_id) ?? { verified: false, failedAttempts: 0, draft: false };
      if (row.status === "verified") s.verified = true;
      if (row.status === "draft") s.draft = true;
      // Yalnız güncel kapı sürümüyle reddedilen denemeler sayılır: kapı düzeltilince eski (yanlış) retler hakkı yemez.
      if (row.status === "rejected" && row.qa?.reason !== "draft_timeout" && row.qa?.gate_version === GATE_VERSION) s.failedAttempts += 1;
      out.set(row.unit_id, s);
    }
  }
  return out;
}

export async function fillStatus(service: SupabaseClient) {
  const order = currentFillOrder();
  const [config, spent, states] = await Promise.all([readFillConfig(service), sharedContentSpent(service), unitStates(service, order.map((t) => t.unitId))]);
  // Soru sayısı ünite bazında: aynı program_id'yi paylaşan gruplar (TYT/AYT) birbirinin sorularını saymasın.
  const itemCounts = new Map<string, number>();
  for (let from = 0; ; from += 1000) {
    const { data } = await service.from("item_bank").select("unit_id").eq("status", "verified").eq("version", CONTENT_VERSION).range(from, from + 999);
    for (const row of data ?? []) itemCounts.set(row.unit_id as string, (itemCounts.get(row.unit_id as string) ?? 0) + 1);
    if (!data || data.length < 1000) break;
  }
  const programs = new Map<string, { group: string; programId: string; units: number; done: number; failed: number; generating: number; pending: number; items: number }>();
  for (const t of order) {
    const key = `${t.group}:${t.programId}`;
    const p = programs.get(key) ?? { group: t.group, programId: t.programId, units: 0, done: 0, failed: 0, generating: 0, pending: 0, items: 0 };
    const s = states.get(t.unitId);
    p.units += 1;
    p.items += itemCounts.get(t.unitId) ?? 0;
    if (s?.verified) p.done += 1;
    else if (s && s.failedAttempts >= MAX_FAILED_ATTEMPTS) p.failed += 1;
    else if (s?.draft) p.generating += 1;
    else p.pending += 1;
    programs.set(key, p);
  }
  const list = [...programs.values()];
  const sum = (k: "units" | "done" | "failed" | "generating" | "pending") => list.reduce((a, p) => a + p[k], 0);
  return {
    enabled: config.enabled,
    spentUsd: Number(spent.toFixed(4)),
    capUsd: config.capUsd,
    remainingUsd: Number(Math.max(0, config.capUsd - spent).toFixed(4)),
    running: config.leaseUntil > Date.now(),
    stepStartedAt: config.metadata.step_started_at ?? null,
    lastRun: config.metadata.last_run ?? null,
    lastDispatch: config.metadata.last_dispatch ?? null,
    totals: { units: sum("units"), done: sum("done"), failed: sum("failed"), generating: sum("generating"), pending: sum("pending"), items: list.reduce((a, p) => a + p.items, 0) },
    programs: list,
  };
}
