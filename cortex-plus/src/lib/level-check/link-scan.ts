import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LEVEL_TOKEN_TTL_MS, verifyLevelToken } from "@/lib/level-check/token";

/**
 * Kurulumun Hızlı Tarama yanıtlarını yeni hazırlığa bağlar (6 Kasım 2026). Resmî kurulumda tarama hazırlık kurulmadan
 * çözülür; yanıtlar `prep_id = null` ile yazılıyor, tahmini net yalnız `prep_id = bu hazırlık` saydığı için kart
 * "Diğer hazırlıklarından N yanıtın var; bu hazırlığın netine sayılmaz" diyordu.
 *
 * Yalnız bu kurulumun oturumları: istemci taramayı başlatırken aldığı imzalı belirteci (hangi soruların sorulduğunu ve
 * oturumun süresini taşır) kurulum isteğiyle gönderir. Bağlanan satır: aynı öğrenci, `quick_scan`, henüz hazırlığa
 * bağlı değil, belirtecin soru listesinde ve oturumun zaman aralığında. Başka hazırlıkların yanıtlarına (prep_id dolu)
 * ve başka oturumların taramasına dokunulmaz.
 */

/** Belirtecin süresi dolsa da kurulum uzun sürebilir: oturum bitiminden sonra bu kadar süre bağlanabilir. */
export const SCAN_LINK_GRACE_MS = 12 * 60 * 60 * 1000;
export const SCAN_LINK_MAX_TOKENS = 6;

export type ScanLinkScope = { items: string[]; since: string; until: string };

/** Geçerli belirteçlerden bağlama kapsamı (saf; imza ve sahiplik burada denetlenir). */
export function scanLinkScopes(tokens: readonly string[], userId: string, now = Date.now()): ScanLinkScope[] {
  const scopes: ScanLinkScope[] = [];
  for (const token of tokens.slice(0, SCAN_LINK_MAX_TOKENS)) {
    const claims = verifyLevelToken(token, now, { graceMs: SCAN_LINK_GRACE_MS });
    if (!claims || claims.uid !== userId || claims.src !== "quick_scan" || claims.prep) continue;
    const items = claims.items.filter((id) => typeof id === "string" && id.length > 0).slice(0, 60);
    if (!items.length) continue;
    scopes.push({
      items,
      since: new Date(claims.exp - LEVEL_TOKEN_TTL_MS).toISOString(),
      until: new Date(claims.exp).toISOString(),
    });
  }
  return scopes;
}

/** Bağlanan yanıt sayısı. Hata yutulur (kurulum düşmez), günlüğe yazılır. */
export async function linkScanResponsesToPrep(
  service: SupabaseClient,
  input: { userId: string; prepId: string; tokens: readonly string[] },
): Promise<number> {
  const scopes = scanLinkScopes(input.tokens, input.userId);
  let linked = 0;
  for (const scope of scopes) {
    const { data, error } = await service
      .from("item_responses")
      .update({ prep_id: input.prepId })
      .eq("user_id", input.userId)
      .is("prep_id", null)
      .eq("source", "quick_scan")
      .in("item_id", scope.items)
      .gte("created_at", scope.since)
      .lte("created_at", scope.until)
      .select("id");
    if (error) {
      console.warn("scan_link_failed", error.message);
      continue;
    }
    linked += data?.length ?? 0;
  }
  if (scopes.length) console.info("scan_link", JSON.stringify({ prepId: input.prepId, sessions: scopes.length, linked }));
  return linked;
}
