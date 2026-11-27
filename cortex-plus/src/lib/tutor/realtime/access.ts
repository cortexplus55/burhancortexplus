import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserEntitlements } from "@/lib/billing/entitlements";
import { billingExempt } from "@/lib/billing/free-preview";
import { REALTIME_FREE_TRIAL_ENABLED, REALTIME_MODEL, type RealtimeAccess } from "@/lib/tutor/realtime/config";

/*
  Kim konuşabilir (21 Kasım 2026, Burhan'ın kararları; 27 Kasım 2026'da ücretsiz deneme kapandı):
  - Plus (aylık / yıllık, kodla açılan Plus denemesi dahil), Sınav Haftası (`plus-haftalik`, kademesi Plus) ve Sigma:
    açık, dakika başına kredi.
  - Kurucu (önizlemesi kapalıyken): açık; ayırma SQL'de yönetici geçişiyle (delta 0) kayda girer.
  - Ücretsiz hesap (önizlemedeki kurucu dahil): 27 Kasım 2026'dan beri kapalı ("plus_required", 402). Burhan'ın kararı:
    "Konuş" ücretsiz hesapta doğrudan Plus yükseltme ekranını açar; ücretsiz trafikle ses gideri büyümesin. Eski hesap
    başına bir kez 1 dakikalık deneme `REALTIME_FREE_TRIAL_ENABLED` anahtarının arkasında duruyor (false); açmak ürün
    sahibinin kararı ve aşağıdaki deneme kaydı o zaman geçerli olur.

  Denemenin kullanıldığı göçsüz ve kalıcı bir kayıttan anlaşılır: `ai_usage_events`'e `REALTIME_VOICE_TRIAL` koduyla
  yazılan sıfır jetonlu satır (ilk ders döngüsünün kanıtı gibi kredi ayırma kaydına benzer; Redis tek başına yetmez).
  Aynı anda gelen iki istekte ilk yazılan satır kazanır: herkes kendi satırını yazar, sonra en eski satıra bakar; en
  eskisi kendisininki değilse kendi satırını siler ve "kullanıldı" döner. Bağlantı hiç kurulamazsa (OpenAI çağrısı
  düştü, ses gelmedi) satır silinir: deneme geri verilir.
*/

export const TRIAL_USAGE_CODE = "REALTIME_VOICE_TRIAL";

export type AccessDecision =
  | { kind: RealtimeAccess }
  | { kind: "plus_required" }
  | { kind: "trial_used" }
  | { kind: "unavailable" };

type Row = { id?: unknown };

/** Deneme kullanıldı mı. Okunamazsa null (çağıran kapıyı açmaz). */
export async function trialUsed(service: SupabaseClient, userId: string): Promise<boolean | null> {
  try {
    const { data, error } = await service
      .from("ai_usage_events")
      .select("id")
      .eq("user_id", userId)
      .eq("action_code", TRIAL_USAGE_CODE)
      .limit(1);
    if (error) {
      console.warn("realtime_trial_read_failed", { code: error.code ?? null });
      return null;
    }
    return (data ?? []).length > 0;
  } catch {
    return null;
  }
}

/** Denemeyi sahiplenir. `markerId` bitişte geri vermek için saklanır. */
export async function claimTrial(
  service: SupabaseClient,
  userId: string,
): Promise<{ ok: true; markerId: string } | { ok: false; reason: "used" | "error" }> {
  try {
    const { data, error } = await service
      .from("ai_usage_events")
      .insert({
        user_id: userId,
        action_code: TRIAL_USAGE_CODE,
        model: REALTIME_MODEL,
        tokens_in: 0,
        tokens_out: 0,
        cost_usd_estimate: 0,
      })
      .select("id")
      .single();
    const markerId = typeof (data as Row | null)?.id === "string" ? String((data as Row).id) : null;
    if (error || !markerId) {
      console.warn("realtime_trial_claim_failed", { code: error?.code ?? null });
      return { ok: false, reason: "error" };
    }
    const { data: first, error: firstError } = await service
      .from("ai_usage_events")
      .select("id")
      .eq("user_id", userId)
      .eq("action_code", TRIAL_USAGE_CODE)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(1);
    if (firstError) {
      await releaseTrial(service, userId, markerId);
      return { ok: false, reason: "error" };
    }
    const winner = (first as Row[] | null)?.[0]?.id;
    if (winner !== markerId) {
      await releaseTrial(service, userId, markerId);
      return { ok: false, reason: "used" };
    }
    return { ok: true, markerId };
  } catch {
    return { ok: false, reason: "error" };
  }
}

/** Denemeyi geri verir (bağlantı kurulamadı). Asla fırlatmaz. */
export async function releaseTrial(service: SupabaseClient, userId: string, markerId: string): Promise<void> {
  try {
    const { error } = await service
      .from("ai_usage_events")
      .delete()
      .eq("id", markerId)
      .eq("user_id", userId)
      .eq("action_code", TRIAL_USAGE_CODE);
    if (error) console.warn("realtime_trial_release_failed", { code: error.code ?? null });
  } catch {
    // geri verilemedi: deneme kullanılmış sayılır (öğrenci aleyhine tek hata yolu; kayıtta görünür)
  }
}

/**
 * Hesabın erişimi. Plan okuması düşerse ücretsiz sayılır (`getUserEntitlements` satırsız = ücretsiz): kapı açılmaz.
 * Ücretsiz hesap "plus_required" alır; deneme anahtarı açıksa (bugün kapalı) deneme okuması düşünce "unavailable".
 */
export async function resolveRealtimeAccess(
  service: SupabaseClient,
  userId: string,
  options: { freeTrial?: boolean } = {},
): Promise<AccessDecision> {
  const [entitlements, exempt] = await Promise.all([
    getUserEntitlements(service, userId).catch(() => null),
    billingExempt(service, userId).catch(() => false),
  ]);
  if (exempt) return { kind: "founder" };
  if (entitlements?.isPaid && (entitlements.plan === "plus" || entitlements.plan === "sigma")) return { kind: "paid" };
  if (!(options.freeTrial ?? REALTIME_FREE_TRIAL_ENABLED)) return { kind: "plus_required" };
  const used = await trialUsed(service, userId);
  if (used === null) return { kind: "unavailable" };
  return used ? { kind: "trial_used" } : { kind: "trial" };
}
