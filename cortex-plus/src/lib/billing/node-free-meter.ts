import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FREE_LIMITS, PLUS_ONLY_NODE_KINDS, freePeriodKey, type FreeMeter } from "@/lib/billing/free-meters";

/**
 * Hazırlık yolundaki adımın ücretsiz sayacı (24 Ekim 2026, ürün sahibinin kararı).
 * - Ders: haftalık ders hakkı.
 * - Podcast, sözlü, yazılı deneme: Plus'ta (çağıran 402 premium_required döner).
 * - Öteki adımlar (test, doğru/yanlış, kartlar, tekrar, odaklı pratik, son kontrol…): o konunun dersi bu
 *   hazırlıkta açılmışsa derse dahil ("included"); açılmamışsa ders hakkından düşer. Konusuz adımda
 *   (`topicId: null`) hazırlıkta herhangi bir ders açılmışsa dahil: rota hazırlık geneli adımı (boşluklar,
 *   odaklı pratik, son kontrol, son kartlar) öğrenci konu seçmediyse böyle sorar — zayıf konuya yönelmesi
 *   sayacı değiştirmez.
 * - "Açılmış" = öğrenciye gerçekten verilmiş ders: kaydı `active` ya da `completed` ve içeriği dolu.
 *   Yazımı süren (`creating`) ya da düşen (`failed`) kayıt sayılmaz — ders hakkı bitmiş öğrencinin
 *   reddedilen ders denemesi o konunun test ve kartlarını derse dahil sayıyordu (inceleme, 24 Ekim 2026).
 */
export function nodeMeterFor(kind: string, lessonOpened: boolean): FreeMeter | "plus" {
  if (PLUS_ONLY_NODE_KINDS.has(kind)) return "plus";
  if (kind === "lesson") return "lesson";
  return lessonOpened ? "included" : "lesson";
}

export async function nodeFreeMeter(
  service: SupabaseClient,
  input: { userId: string; prepId: string; kind: string; topicId: string | null },
): Promise<FreeMeter | "plus"> {
  if (PLUS_ONLY_NODE_KINDS.has(input.kind) || input.kind === "lesson") return nodeMeterFor(input.kind, false);
  return nodeMeterFor(input.kind, await lessonOpenedInPrep(service, input));
}

/** Öğrenciye verilmiş dersin kayıt durumları (`exam_prep_node_attempts.status`: creating | active | failed | completed). */
const DELIVERED_LESSON_STATUSES = ["active", "completed"];

async function lessonOpenedInPrep(
  service: SupabaseClient,
  input: { userId: string; prepId: string; topicId: string | null },
): Promise<boolean> {
  try {
    const { data: lessons } = await service
      .from("exam_prep_nodes")
      .select("id")
      .eq("exam_prep_id", input.prepId)
      .eq("kind", "lesson");
    const ids = ((lessons ?? []) as { id: string }[]).map((row) => row.id);
    if (!ids.length) return false;
    let query = service
      .from("exam_prep_node_attempts")
      .select("id", { count: "exact", head: true })
      .eq("exam_prep_id", input.prepId)
      .eq("user_id", input.userId)
      .in("node_id", ids)
      .in("status", DELIVERED_LESSON_STATUSES)
      .not("payload", "is", null);
    if (input.topicId) query = query.eq("topic_id", input.topicId);
    const { count } = await query;
    return (count ?? 0) > 0;
  } catch {
    // Okunamazsa ders hakkından düşer (öğrenci aleyhine değil, maliyet aleyhine hata yapmayalım).
    return false;
  }
}

/** Bu dönemde sayaçta kalan hak; okunamazsa null (çağıran engellemez). */
export async function freeMeterRemaining(
  service: SupabaseClient,
  userId: string,
  meter: FreeMeter,
): Promise<number | null> {
  try {
    const { data, error } = await service
      .from("free_usage")
      .select("used")
      .eq("user_id", userId)
      .eq("meter", meter)
      .eq("period_key", freePeriodKey(meter))
      .maybeSingle();
    if (error) return null;
    return Math.max(0, FREE_LIMITS[meter] - ((data?.used as number | undefined) ?? 0));
  } catch {
    return null;
  }
}
