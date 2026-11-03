import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateReinforceItems, openaiLlm, type LlmCall } from "@/lib/content-pool/generate";
import { CONTENT_VERSION, type PoolUnit } from "@/lib/content-pool/keys";
import { supabasePoolStore } from "@/lib/content-pool/supabase-store";
import type { PoolItem } from "@/lib/content-pool/schema";
import { foldLabel } from "@/lib/billing/free-topic-rule";
import { freeOpenTopicLabel } from "@/lib/billing/free-topic-gate";

/*
  Paket 3 (3 Kasım 2026): "🔥 Bu Alt Konudan Yeni Pekiştirme Testi Aç". Öğrenci kredisi 0; öğrenci başına günde
  REINFORCE_DAILY_LIMIT üretim. Maliyet REINFORCE_* koduyla yazılır ve doldurucuyla AYNI havuz tavanına sayılır (poolBudgetAllows; Paket 3b).
  Geçen soru item_bank'a herkes için yazılır (read-through): origin='reinforce'. CHECK henüz yalnız 'cortex_original'
  kabul ediyorsa (migration 20261103130000 uygulanmadıysa) satır varsayılan origin'le, qa.origin='reinforce' ile yazılır.
*/
export const REINFORCE_DAILY_LIMIT = 3;
/** Bir yeni pekiştirme testinin hedef soru sayısı (havuz + yeni üretim karışık). */
export const REINFORCE_TARGET = 5;

/**
 * reinforce_new adımı (saf, test edilir). fill=false: havuzda görülmemiş soru varsa anında sun; hedefin altındaysa
 * `more` ile istemci arkada fill=true ister. fill=true ya da havuz boşsa: üretim (yazar → v14 → kör çözücü → item_bank).
 */
export function reinforceNewStep(readyCount: number, fill: boolean): { serveReady: boolean; more: boolean } {
  if (fill || readyCount <= 0) return { serveReady: false, more: false };
  return { serveReady: true, more: readyCount < REINFORCE_TARGET };
}

/** İstanbul gününün başlangıcı (UTC ISO). */
export function istanbulDayStart(now = new Date()): string {
  const local = new Date(now.getTime() + 3 * 3_600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - 3 * 3_600_000).toISOString();
}

export async function reinforceUsedToday(service: SupabaseClient, userId: string): Promise<number | null> {
  const { count, error } = await service
    .from("ai_usage_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("action_code", "REINFORCE_ITEMS")
    .gte("created_at", istanbulDayStart());
  return error ? null : (count ?? 0);
}

/** Ücretsiz hesap kuralı: yalnız açık konu (1. konu) ya da planın ilk ünitesi. Okuma düşerse açık (öğrenci aleyhine hata yok). */
export async function reinforceAllowedForFree(
  service: SupabaseClient,
  input: { userId: string; prepId: string; unitTitle: string; order: number | null },
): Promise<boolean> {
  const label = await freeOpenTopicLabel(service, input.userId, input.prepId).catch(() => null);
  if (label === null) return true;
  return input.order === 0 || foldLabel(label) === foldLabel(input.unitTitle);
}

export function reinforceRows(unit: PoolUnit, outcomeId: string, items: PoolItem[], userId: string, verifyModel: string, withOrigin: boolean) {
  return items.map((item) => ({
    content_id: null,
    unit_id: unit.unitId,
    outcome_id: outcomeId,
    program_id: unit.program.id,
    version: CONTENT_VERSION,
    difficulty: item.difficulty,
    stem: item.stem,
    choices: item.choices,
    answer: item.answer,
    explanation: item.explanation,
    status: "verified",
    ...(withOrigin ? { origin: "reinforce" } : {}),
    qa: { outcome_code: item.outcome_code, verified_by: verifyModel, origin: "reinforce", requested_by: userId, gate_version: 14, triad: true },
  }));
}

export type ReinforceNewResult = { state: "ok"; ids: string[] } | { state: "none" } | { state: "unavailable" };

export async function createReinforceItems(
  service: SupabaseClient,
  input: { unit: PoolUnit; outcomeCode: string; userId: string; existingStems: string[] },
  llm: LlmCall | null = openaiLlm(),
): Promise<ReinforceNewResult> {
  const outcome = input.unit.outcomes.find((o) => o.code === input.outcomeCode);
  if (!llm || !outcome) return { state: "unavailable" };
  const store = supabasePoolStore(service);
  const verifyModel = "gpt-6-luna";
  let result: Awaited<ReturnType<typeof generateReinforceItems>>;
  try {
    result = await generateReinforceItems(input.unit, input.outcomeCode, llm, {
      existingStems: input.existingStems,
      onUsage: (entry) => store.recordUsage(input.userId, [entry]).catch(() => undefined),
    });
  } catch (error) {
    console.error("[reinforce-new] üretim düştü", String(error));
    return { state: "unavailable" };
  }
  if (!result.items.length) return { state: "none" };
  const insert = (withOrigin: boolean) =>
    service.from("item_bank").insert(reinforceRows(input.unit, outcome.outcomeId, result.items, input.userId, verifyModel, withOrigin)).select("id");
  let { data, error } = await insert(true);
  if (error && (error.code === "23514" || /origin/i.test(error.message ?? ""))) ({ data, error } = await insert(false));
  if (error) {
    console.error("[reinforce-new] item_bank yazılamadı", error.message);
    return { state: "unavailable" };
  }
  return { state: "ok", ids: ((data ?? []) as { id: string }[]).map((r) => r.id) };
}
