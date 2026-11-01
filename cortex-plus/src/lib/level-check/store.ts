import "server-only";
import { levelUnitTitle } from "@/lib/level-check/titles";
import type { SupabaseClient } from "@supabase/supabase-js";
import { poolUnit } from "@/lib/content-pool/keys";
import { applyResponse, PRIOR, type Difficulty } from "@/lib/level-check/mastery";
import type { PickItem } from "@/lib/level-check/select";
import type { LevelItem } from "@/lib/level-check/types";
import type { LevelSource } from "@/lib/level-check/token-types";

type ItemRow = { id: string; unit_id: string; outcome_id: string; difficulty: Difficulty; stem: string; choices: string[]; qa: { outcome_code?: string } | null };

/** Havuzdaki doğrulanmış sorular (cevap anahtarı seçilmez). */
export async function loadVerifiedItems(service: SupabaseClient, unitIds: string[]): Promise<ItemRow[]> {
  if (!unitIds.length) return [];
  const { data, error } = await service
    .from("item_bank")
    .select("id, unit_id, outcome_id, difficulty, stem, choices, qa")
    .in("unit_id", unitIds)
    .eq("status", "verified")
    .order("created_at");
  if (error) return [];
  return (data ?? []) as ItemRow[];
}

export const toPick = (r: ItemRow): PickItem => ({ id: r.id, unitId: r.unit_id, outcomeId: r.outcome_id, difficulty: r.difficulty });

/** İstemciye giden soru: kök, şıklar, kazanım; cevap ve açıklama yok. */
export function toLevelItem(r: ItemRow): LevelItem {
  const unit = poolUnit(r.unit_id);
  const outcome = unit?.outcomes.find((o) => o.outcomeId === r.outcome_id);
  return {
    id: r.id,
    unitId: r.unit_id,
    unitTitle: levelUnitTitle(r.unit_id) ?? unit?.unit.title ?? "",
    outcomeId: r.outcome_id,
    outcomeCode: outcome?.code ?? r.qa?.outcome_code ?? "",
    outcomeText: outcome?.text ?? "",
    difficulty: r.difficulty,
    stem: r.stem,
    choices: Array.isArray(r.choices) ? r.choices.map(String) : [],
  };
}

/** Tablo henüz yoksa (göç uygulanmadı) yazma sessizce atlanır; not alma çalışmaya devam eder. */
function missingTable(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (error.code === "42P01" || error.code === "PGRST205" || /does not exist|schema cache/i.test(error.message ?? "")));
}

export async function unitCheckDone(service: SupabaseClient, userId: string, unitId: string, prepId: string): Promise<boolean> {
  const { data, error } = await service
    .from("item_responses")
    .select("id")
    .eq("user_id", userId)
    .eq("unit_id", unitId)
    .eq("prep_id", prepId)
    .eq("source", "unit_check")
    .limit(1);
  if (error) return false;
  return Boolean(data?.length);
}

export async function levelTablesReady(service: SupabaseClient): Promise<boolean> {
  const { error } = await service.from("outcome_mastery").select("user_id").limit(1);
  return !missingTable(error);
}

/** Yanıtı kaydeder ve kazanım ustalığını (α, β, n) günceller. Tablo yoksa false. */
export async function recordResponse(
  service: SupabaseClient,
  input: {
    userId: string;
    item: { id: string; unit_id: string; outcome_id: string; program_id: string; difficulty: Difficulty };
    correct: boolean;
    timeMs: number;
    source: LevelSource;
    prepId: string | null;
    /** Oturumun başlangıcı: aynı oturumda aynı soru ikinci kez sayılmaz. */
    since: string;
  },
): Promise<boolean> {
  const { item } = input;
  const { data: dup, error: dupError } = await service
    .from("item_responses")
    .select("id")
    .eq("user_id", input.userId)
    .eq("item_id", item.id)
    .eq("source", input.source)
    .gte("created_at", input.since)
    .limit(1);
  if (dupError) return false;
  if (dup?.length) return true;
  const { error } = await service.from("item_responses").insert({
    user_id: input.userId,
    item_id: item.id,
    unit_id: item.unit_id,
    outcome_id: item.outcome_id,
    prep_id: input.prepId,
    correct: input.correct,
    difficulty: item.difficulty,
    time_ms: Math.max(0, Math.min(Math.round(input.timeMs), 3_600_000)),
    source: input.source,
  });
  if (error) return false;
  const { data: row } = await service
    .from("outcome_mastery")
    .select("alpha, beta, n")
    .eq("user_id", input.userId)
    .eq("outcome_id", item.outcome_id)
    .maybeSingle();
  const prev = row ? { alpha: Number(row.alpha), beta: Number(row.beta), n: Number(row.n) } : PRIOR;
  const next = applyResponse(prev, input.correct, item.difficulty);
  const { error: upsertError } = await service.from("outcome_mastery").upsert(
    {
      user_id: input.userId,
      outcome_id: item.outcome_id,
      unit_id: item.unit_id,
      program_id: item.program_id,
      alpha: next.alpha,
      beta: next.beta,
      n: next.n,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,outcome_id" },
  );
  return !upsertError;
}
