import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordResponse } from "@/lib/level-check/store";
import type { Difficulty } from "@/lib/level-check/mastery";
import { poolResponsePlan, type PoolAnswer } from "@/lib/content-pool/answer-index";

/**
 * Havuz sorusu cevapları Hakimiyet Haritası'na (3 Kasım 2026): yazılı deneme ve havuz konu testi cevabı
 * kazanım (outcome_id) üzerinden item_responses (+ chosen) ve outcome_mastery'ye yazılır. Kaynak "practice".
 * Aynı oturumda aynı soru ikinci kez sayılmaz (`since`). Hata öğrencinin sonucunu düşürmez; yazılan sayı döner.
 */
export async function recordPoolAnswers(
  service: SupabaseClient,
  input: { userId: string; prepId: string | null; since: string; answers: readonly PoolAnswer[] },
): Promise<number> {
  const ids = [...new Set(input.answers.map((a) => a.poolItemId).filter(Boolean))];
  if (!ids.length) return 0;
  const { data, error } = await service
    .from("item_bank")
    .select("id, unit_id, outcome_id, program_id, difficulty, choices")
    .in("id", ids);
  if (error || !data?.length) return 0;
  const rows = data as { id: string; unit_id: string; outcome_id: string; program_id: string; difficulty: Difficulty; choices: unknown }[];
  const byId = new Map(rows.map((row) => [row.id, row]));
  let written = 0;
  // Sırayla: outcome_mastery oku-güncelle aynı kazanımda yarışmasın.
  for (const plan of poolResponsePlan(rows, input.answers)) {
    const item = byId.get(plan.poolItemId)!;
    const ok = await recordResponse(service, {
      userId: input.userId,
      item: { id: item.id, unit_id: item.unit_id, outcome_id: item.outcome_id, program_id: item.program_id, difficulty: item.difficulty },
      correct: plan.correct,
      chosen: plan.chosen,
      timeMs: 0,
      source: "practice",
      prepId: input.prepId,
      since: input.since,
    }).catch(() => false);
    if (ok) written += 1;
  }
  return written;
}
