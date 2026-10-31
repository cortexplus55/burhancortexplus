/**
 * Belirlenimli kredi anahtarı (31 Ekim 2026, Paket J denetimi #9).
 *
 * Neden: podcast ve video istekleri anahtarın sonuna istemcinin `requestId`'sini ya da rastgele bir UUID koyuyordu.
 * İki sekme (ya da yenileme) aynı içeriği aynı anda isteyince iki ayrı anahtar → iki ayrı kredi ayırması oluyordu.
 * Ders ve test bunu deneme satırı + `exam_node_slot_…` anahtarıyla zaten çözüyordu; bu yardımcı aynı ilkeyi geneller.
 *
 * Anahtar: `<taban>:slot<n>`; n = bu kullanıcının bu tabanla SONUÇLANMIŞ (committed) ayırma sayısı.
 * - Aynı anda iki istek: ikisi de aynı n'i görür, aynı anahtarı kullanır; ödeme RPC'si ikinci çağrıda var olan
 *   ayırmayı döndürür → tek kesinti.
 * - Başarıdan sonra yeni istek: n bir artar → yeni (meşru) kesinti.
 * - Düşen ve iade edilen deneme: iade edilen anahtar RPC'de `:refunded:<id>` olarak yeniden adlanır, sayılmaz;
 *   tekrar deneme aynı anahtarla yeni ayırma açar.
 * Sayım okunamazsa (ağ, izin) eski davranışa düşülür: rastgele son ek (çift kesinti riski, ama istek düşmez).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export function slotKey(base: string, committed: number): string {
  return `${base}:slot${Math.max(0, Math.floor(committed))}`;
}

/** LIKE desenindeki joker karakterleri kaçırır. */
export function likePrefix(base: string): string {
  return `${base.replace(/[\\%_]/g, (char) => `\\${char}`)}:slot%`;
}

export async function deterministicCreditKey(
  service: SupabaseClient,
  userId: string,
  base: string,
  fallbackSuffix: () => string = () => crypto.randomUUID(),
): Promise<string> {
  try {
    const { count, error } = await service
      .from("credit_reservations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "committed")
      .like("idempotency_key", likePrefix(base));
    if (error || typeof count !== "number") return `${base}:${fallbackSuffix()}`;
    return slotKey(base, count);
  } catch {
    return `${base}:${fallbackSuffix()}`;
  }
}
