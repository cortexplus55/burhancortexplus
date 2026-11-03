import { turkishFold } from "@/lib/text/turkish";

/*
  Yakın kopya kontrolü (3 Kasım 2026): pekiştirme üretiminde yeni soru kökü, aynı kazanımdaki mevcut köklerle
  kelime kümesi benzerliğiyle (Jaccard) karşılaştırılır. Tam eşitlik yetmiyordu: "Karahanlılar ve Gaznelilerle ilgili
  aşağıdaki yargılardan hangileri doğrudur? I. … II. …" kalıbı yargılar biraz değişince havuza ikinci kez giriyordu.
*/

export const NEAR_DUPLICATE_THRESHOLD = 0.7;

function tokens(text: string): Set<string> {
  return new Set(
    turkishFold(text)
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .split(" ")
      .filter((t) => t.length > 1),
  );
}

export function stemSimilarity(a: string, b: string): number {
  const x = tokens(a);
  const y = tokens(b);
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const t of x) if (y.has(t)) shared += 1;
  return shared / (x.size + y.size - shared);
}

/** En yüksek benzerlik ve eşik aşıldı mı. */
export function nearestStem(stem: string, existing: readonly string[]): { max: number; duplicate: boolean } {
  let max = 0;
  for (const other of existing) max = Math.max(max, stemSimilarity(stem, other));
  return { max: Math.round(max * 1000) / 1000, duplicate: max >= NEAR_DUPLICATE_THRESHOLD };
}
