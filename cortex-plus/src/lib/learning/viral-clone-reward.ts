import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingFunctionError } from "@/lib/auth/admin-role";
import { CLONE_REWARD_BODY, CLONE_REWARD_TITLE } from "@/lib/learning/class-share";
import { missingSchema } from "@/lib/learning/missing-column";
import { notifyInApp } from "@/lib/notifications/in-app";

/**
 * Klonlanan yolun ödülü (Faz 7, 20 Kasım 2026, ürün sahibinin kararı): arkadaş klonladığı hazırlığın 1. konusunun
 * konu testini bitirince paylaşana +50 kredi ve uygulama içi bildirim. Bütün kurallar (aylık 5 arkadaş, kendini
 * davet, aynı posta kutusu, aynı IP'den günde en çok 3 ödül (Faz 8; önce katı aynı IP engeliydi), doğrulanmış e-posta, davet hediyesiyle çift başına tek ödül) tek SQL işlevinde,
 * kilit altında (`claim_clone_referral_reward`). Bu modül yalnız uygun olayı seçer ve işlevi çağırır.
 *
 * Tamamlama akışı bunu yanıttan sonra çağırır (`deferTask`): asla atmaz, tamamlamayı bekletmez ya da düşürmez. Göç
 * henüz uygulanmadıysa (sütun ya da işlev yok) sessizce atlanır.
 */

/** SQL işlevinin döndürdüğü durumlar (göç 20261120140000). */
const CLAIM_STATUSES = [
  "granted",
  "not_clone",
  "source_missing",
  "self",
  "already_rewarded",
  "unverified",
  "same_email",
  // Eski işlev (göç 20261120140000) aynı IP'yi engelliyordu; Faz 8 göçünden (20261120160000) sonra yerine günlük tavan.
  "same_ip",
  "ip_daily_cap",
  "wallet_missing",
  "referral_gift",
  "monthly_cap",
  "gift_failed",
] as const;
type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export type CloneRewardStatus = ClaimStatus | "skipped_kind" | "not_first_topic" | "unavailable" | "failed";

function claimStatus(value: unknown): ClaimStatus | null {
  return (CLAIM_STATUSES as readonly string[]).includes(String(value)) ? (value as ClaimStatus) : null;
}

export async function rewardCloneReferral(
  service: SupabaseClient,
  input: { userId: string; prepId: string; kind: string; topicId: string | null },
): Promise<CloneRewardStatus> {
  if (input.kind !== "quiz") return "skipped_kind";
  try {
    const { data: prep, error } = await service
      .from("exam_preps")
      .select("cloned_from_prep_id")
      .eq("id", input.prepId)
      .eq("user_id", input.userId)
      .maybeSingle();
    if (error) return missingSchema(error) ? "unavailable" : "failed";
    if (!prep?.cloned_from_prep_id) return "not_clone";

    // Konu testi 1. konunun mu: bitirmenin sorulan konusu hazırlığın ilk sıradaki konusu.
    const { data: first } = await service
      .from("exam_prep_topics")
      .select("id")
      .eq("exam_prep_id", input.prepId)
      .order("sort_order")
      .limit(1)
      .maybeSingle();
    if (!first?.id || !input.topicId || first.id !== input.topicId) return "not_first_topic";

    const { data, error: rpcError } = await service.rpc("claim_clone_referral_reward", { p_clone_prep: input.prepId });
    if (rpcError) {
      if (isMissingFunctionError(rpcError) || missingSchema(rpcError)) return "unavailable";
      console.warn("clone_reward_failed", { code: (rpcError as { code?: string }).code ?? null });
      return "failed";
    }
    const result = (data ?? {}) as { status?: unknown; referrer?: unknown };
    const status = claimStatus(result.status) ?? "failed";
    if (status === "granted" && typeof result.referrer === "string") {
      await notifyInApp(service, {
        userId: result.referrer,
        kind: "referral_reward",
        title: CLONE_REWARD_TITLE,
        body: CLONE_REWARD_BODY,
        actionUrl: "/krediler",
        dedupeKey: `referral_reward:${input.userId}`,
      });
    }
    console.info("clone_reward", { status });
    return status;
  } catch (error) {
    console.warn("clone_reward_failed", { cause: error instanceof Error ? error.message.slice(0, 120) : "unknown" });
    return "failed";
  }
}
