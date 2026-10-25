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

/**
 * Düzey önerisini beslemeyen puanlı etkinlikler. Podcast'in dinleme kontrolü (20 Ekim 2026) az önce
 * duyulanı soran üç kolay soru: 3/3 "fazla kolay" önerisini tetiklemesin (ürün sahibinin kararı).
 */
// Kartlar (25 Ekim 2026, P1-7): puanları artık hatırlanan / kart; öğrencinin kendi beyanı düzey önermez.
const LEVEL_HINT_EXCLUDED_KINDS: ReadonlySet<string> = new Set(["podcast", "flashcards", "spaced"]);
/** Dışarıda kalan türler araya girse de son iki puanlı sonuç bulunsun diye okunan kayıt. */
const LEVEL_HINT_LOOKBACK = 8;

/** Sonuç ekranı için: son iki puanlı bitiş (podcast kontrolü hariç) ve hazırlığın düzeyi. */
export async function loadLevelHint(service: SupabaseClient, prepId: string): Promise<LevelHint | null> {
  const [{ data: attempts }, { data: topics }] = await Promise.all([
    service
      .from("exam_prep_node_attempts")
      .select("score, total, node_id")
      .eq("exam_prep_id", prepId)
      .eq("status", "completed")
      .gt("total", 1)
      .order("updated_at", { ascending: false })
      .limit(LEVEL_HINT_LOOKBACK),
    service.from("exam_prep_topics").select("familiarity").eq("exam_prep_id", prepId),
  ]);
  const rows = attempts ?? [];
  const nodeIds = [...new Set(rows.map((row) => row.node_id).filter((id): id is string => typeof id === "string"))];
  const { data: nodes } = nodeIds.length
    ? await service.from("exam_prep_nodes").select("id, kind").in("id", nodeIds)
    : { data: [] as { id: string; kind: string }[] };
  const excluded = new Set(
    (nodes ?? []).filter((node) => LEVEL_HINT_EXCLUDED_KINDS.has(String(node.kind))).map((node) => String(node.id)),
  );
  const pct = rows
    .filter((row) => !excluded.has(String(row.node_id)))
    .filter((row) => typeof row.score === "number" && typeof row.total === "number" && row.total > 0)
    .slice(0, 2)
    .map((row) => Math.round(((row.score as number) / (row.total as number)) * 100));
  return levelHintFromScores(pct, prepFamiliarity((topics ?? []).map((row) => row.familiarity)));
}
