import "server-only";
import { redisPipeline } from "@/lib/rate-limit";

/**
 * "İki şık arasında kaldım" soru başına bir kez (20 Kasım 2026, Faz 5 denetimi). Uç her şık çifti için bir çeldirici
 * eliyordu; aynı soruda farklı çiftlerle tekrar tekrar sorup bütün çeldiriciler toplanabiliyor, hiç elenmeyen şık
 * doğru cevap oluyordu. Artık ilk cevap (ipucu + elenen şık) öğrenci + deneme + soru anahtarıyla saklanır; aynı soruda
 * sonraki her istek aynı cevabı `used: true` ile alır, yeni şık elenmez.
 *
 * Kayıt Redis'te 7 gün (deneme bundan uzun açık kalmaz); Redis yoksa bu sunucunun belleğinde.
 */
export type TwoOptionAnswer = { hint: string; fallback: boolean; eliminated: string | null };

const TTL_SECONDS = 7 * 24 * 3600;
const memory = new Map<string, { at: number; value: TwoOptionAnswer }>();

export function twoOptionKey(userId: string, attemptId: string, index: number): string {
  return `two-opt:${userId}:${attemptId}:${index}`;
}

function parse(raw: unknown): TwoOptionAnswer | null {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<TwoOptionAnswer>;
    if (typeof value.hint !== "string") return null;
    return { hint: value.hint, fallback: Boolean(value.fallback), eliminated: typeof value.eliminated === "string" ? value.eliminated : null };
  } catch {
    return null;
  }
}

/** Bu soruda daha önce verilmiş cevap (yoksa null). */
export async function readTwoOptionAnswer(key: string, now = Date.now()): Promise<TwoOptionAnswer | null> {
  const result = await redisPipeline([["GET", key]]);
  if (result) return parse(result[0]);
  const hit = memory.get(key);
  if (hit && now - hit.at < TTL_SECONDS * 1000) return hit.value;
  return null;
}

/**
 * İlk cevabı saklar. Aynı anda gelen iki istekten yalnız biri yazar (SET NX); öbürü saklanmış cevabı döner. Saklama
 * düşerse (Redis hatası) cevap yine verilir: sınır kötüye kullanım koruması, öğrenciyi kapıda bırakmaz.
 */
export async function claimTwoOptionAnswer(key: string, value: TwoOptionAnswer, now = Date.now()): Promise<TwoOptionAnswer> {
  const result = await redisPipeline([["SET", key, JSON.stringify(value), "NX", "EX", String(TTL_SECONDS)]]);
  if (result) {
    if (result[0] === "OK") return value;
    return (await readTwoOptionAnswer(key, now)) ?? value;
  }
  const hit = memory.get(key);
  if (hit && now - hit.at < TTL_SECONDS * 1000) return hit.value;
  memory.set(key, { at: now, value });
  return value;
}

/** Yalnız testler. */
export function clearTwoOptionMemory(): void {
  memory.clear();
}
