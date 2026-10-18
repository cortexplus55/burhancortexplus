import type { SupabaseClient } from "@supabase/supabase-js";
import { parseFamiliarity, type Familiarity } from "@/lib/learning/session-signals";

/**
 * Hazırlığın düzeyini sonuçlara göre ayarlama (18 Ekim 2026, Astra ile yan yana bakıldı).
 * Astra testi bitirince "Bu hazırlık sana fazla zor gelebilir — son dersinde çok yanlış
 * yaptın, önceki derslerde de benzer zorluklar vardı" deyip kolay / tam kararında / zor
 * seçtiriyor. Bizde düzey konunun aşinalığıdır (kurulumda bir kez sorulur); öneri yalnız
 * iki puanlı sonuç aynı yönü gösterince çıkar, karar öğrencinindir.
 */
export type LevelHint = "too_hard" | "too_easy";
export type LevelDirection = "easier" | "harder";

/** Etkili üç basamak: zorluk ve ders kuşağı bunlara göre seçilir (`difficultyFromFamiliarity`). */
const LEVEL_FAMILIARITY: Record<1 | 2 | 3, Familiarity> = { 1: "heard", 2: "basics", 3: "confident" };

export function familiarityLevel(value: Familiarity): 1 | 2 | 3 {
  if (value === "new" || value === "heard") return 1;
  if (value === "confident") return 3;
  return 2;
}

/** Bir basamak kolay ya da zor; uçta olduğu yerde kalır. */
export function shiftFamiliarity(value: Familiarity, direction: LevelDirection): Familiarity {
  const level = familiarityLevel(value);
  const next = direction === "easier" ? Math.max(1, level - 1) : Math.min(3, level + 1);
  return next === level ? value : LEVEL_FAMILIARITY[next as 1 | 2 | 3];
}

const HARD_BELOW = 50;
const EASY_FROM = 90;

/**
 * Son iki puanlı sonuç (yeni → eski, yüzde) aynı yönü gösteriyorsa öneri. Gidilecek basamak
 * yoksa (zaten en kolay / en zor) öneri yok.
 */
export function levelHintFromScores(recentPct: number[], current: Familiarity): LevelHint | null {
  const [last, previous] = recentPct;
  if (last == null || previous == null) return null;
  const level = familiarityLevel(current);
  if (last < HARD_BELOW && previous < HARD_BELOW && level > 1) return "too_hard";
  if (last >= EASY_FROM && previous >= EASY_FROM && level < 3) return "too_easy";
  return null;
}

/** Hazırlığın baskın aşinalığı: en çok konuda yazılı olan (yoksa varsayılan). */
export function prepFamiliarity(values: unknown[]): Familiarity {
  const counts = new Map<Familiarity, number>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const parsed = parseFamiliarity(value);
    counts.set(parsed, (counts.get(parsed) ?? 0) + 1);
  }
  let best: Familiarity | null = null;
  for (const [value, count] of counts) if (!best || count > (counts.get(best) ?? 0)) best = value;
  return best ?? parseFamiliarity(null);
}

/** Sonuç ekranı için: son iki puanlı bitiş ve hazırlığın düzeyi. */
export async function loadLevelHint(service: SupabaseClient, prepId: string): Promise<LevelHint | null> {
  const [{ data: attempts }, { data: topics }] = await Promise.all([
    service
      .from("exam_prep_node_attempts")
      .select("score, total")
      .eq("exam_prep_id", prepId)
      .eq("status", "completed")
      .gt("total", 1)
      .order("updated_at", { ascending: false })
      .limit(2),
    service.from("exam_prep_topics").select("familiarity").eq("exam_prep_id", prepId),
  ]);
  const pct = (attempts ?? [])
    .filter((row) => typeof row.score === "number" && typeof row.total === "number" && row.total > 0)
    .map((row) => Math.round(((row.score as number) / (row.total as number)) * 100));
  return levelHintFromScores(pct, prepFamiliarity((topics ?? []).map((row) => row.familiarity)));
}
