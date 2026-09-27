import "server-only";
import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionCode } from "@/lib/env";

export type ReservationResult =
  | { ok: true; reservationId: string; cost: number }
  | { ok: false; reason: "insufficient_credits" | "invalid_action" | "operation_in_progress" | "operation_completed" | "error" };

export function newIdempotencyKey(prefix: string) {
  return `${prefix}_${randomUUID()}`;
}

export async function getActionCost(
  service: SupabaseClient,
  actionCode: ActionCode,
): Promise<number | null> {
  const { data } = await service
    .from("credit_rules")
    .select("credit_cost")
    .eq("action_code", actionCode)
    .eq("active", true)
    .maybeSingle();
  return data?.credit_cost ?? null;
}

export async function reserveCredits(
  service: SupabaseClient,
  userId: string,
  actionCode: ActionCode,
  idempotencyKey: string,
  /**
   * Kaç birim iş yapılacağı. Varsayılan 1 — on bir eylemin onu sabit fiyatlı
   * ve parametreyi hiç göndermiyor.
   *
   * Seslendirme için var: önbellek paylaşımlı olduğu için aynı istekte kimi
   * cümle bedava gelir, kimi yeniden üretilir. Düz ücret ikisini de yanlış
   * fiyatlar — bedava geleni faturalandırır, uzun üretimi zarara yazar.
   */
  quantity = 1,
): Promise<ReservationResult> {
  // Miktar burada bir kez normalleşiyor ve RPC'ye de bu hâli gidiyor.
  // Ham değeri göndermek, sunucunun kırptığı bir sayıyla burada hesaplanan
  // tutarın ayrışması demekti: kullanıcıya bir rakam gösterip cüzdanından
  // başka bir rakam düşerdi. Sunucu tarafındaki kırpma yine duruyor —
  // `credit_reserve` tek başına da doğru davranmalı.
  const units = Math.min(Math.max(Math.trunc(quantity) || 1, 1), 1000);

  const { data, error } = await service.rpc("credit_reserve", {
    p_user_id: userId,
    p_action_code: actionCode,
    p_idempotency_key: idempotencyKey,
    p_quantity: units,
  });

  if (error) {
    if (error.message.includes("insufficient")) {
      return { ok: false, reason: "insufficient_credits" };
    }
    if (error.message.includes("invalid_action")) {
      return { ok: false, reason: "invalid_action" };
    }
    return { ok: false, reason: "error" };
  }

  if (typeof data !== "string" || !data) return { ok: false, reason: "error" };
  const { data: claim, error: claimError } = await service.rpc("credit_claim_operation", {
    p_reservation_id: data,
    p_token: randomUUID(),
  });
  if (claimError) return { ok: false, reason: "error" };
  if (claim?.state !== "claimed") return {
    ok: false,
    reason: claim?.state === "busy" ? "operation_in_progress" : claim?.state === "committed" ? "operation_completed" : "error",
  };
  return { ok: true, reservationId: data, cost: claim.amount as number };
}

export async function commitCredits(
  service: SupabaseClient,
  reservationId: string,
) {
  const { error } = await service.rpc("credit_commit", { p_reservation_id: reservationId });
  if (error) {
    console.error("credit_transaction_failed", { operation: "commit", reservationId, code: error.code });
    throw new Error("credit_commit_failed");
  }
}

export async function refundCredits(
  service: SupabaseClient,
  reservationId: string,
) {
  const { error } = await service.rpc("credit_refund", { p_reservation_id: reservationId });
  if (error) {
    console.error("credit_transaction_failed", { operation: "refund", reservationId, code: error.code });
    throw new Error("credit_refund_failed");
  }
}

/**
 * Vercel hard-kill (300 sn) sonrası pending kalan rezervasyonları iade et.
 * Yeni migration yok — mevcut credit_reservations + credit_refund.
 * Best-effort: hata üretim yolunu bozmaz.
 */
export async function refundStalePendingReservations(
  service: SupabaseClient,
  options: {
    userId?: string;
    /** Varsayılan 10 dakika. */
    olderThanMs?: number;
    limit?: number;
  } = {},
): Promise<number> {
  const olderThanMs = options.olderThanMs ?? 10 * 60_000;
  const cutoff = new Date(Date.now() - olderThanMs).toISOString();
  try {
    let query = service
      .from("credit_reservations")
      .select("id")
      .eq("status", "pending")
      .lt("created_at", cutoff)
      .order("created_at", { ascending: true })
      .limit(options.limit ?? 40);
    if (options.userId) query = query.eq("user_id", options.userId);
    const { data, error } = await query;
    if (error || !data?.length) return 0;
    let refunded = 0;
    for (const row of data) {
      try {
        await refundCredits(service, row.id as string);
        refunded += 1;
      } catch {
        // tek satır düşmesin diye devam
      }
    }
    if (refunded) {
      console.error("stale_credit_reservations_refunded", {
        count: refunded,
        userId: options.userId ?? null,
      });
    }
    return refunded;
  } catch {
    return 0;
  }
}

/**
 * Sesin kendi eylem kodlari.
 *
 * Seslendirme ve cozumleme krediden dusmuyor (bedeli dugume dahil), bu yuzden
 * `ActionCode` birligine girmiyorlar — ama maliyeti olan tek kalem olmalari
 * onlari olculmesi en gerekli yer yapiyor. `ai_usage_events.action_code`
 * serbest metin oldugu icin sema degisikligi gerekmiyor.
 */
export type UsageCode =
  | ActionCode
  | "TTS_SYNTHESIZE"
  | "STT_TRANSCRIBE"
  /** Adaptive Learning Engine — orchestration (0 student credits). */
  | "ADAPTIVE_JEV"
  | "ADAPTIVE_DECISION"
  | "ADAPTIVE_DECISION_ESCALATION"
  | "ADAPTIVE_DECISION_FALLBACK"
  | "ADAPTIVE_ACTION_CONTENT"
  | "ADAPTIVE_ANSWER_EVAL";

export async function recordUsage(
  service: SupabaseClient,
  params: {
    userId: string;
    actionCode: UsageCode;
    model: string;
    tokensIn: number;
    tokensOut: number;
    reservationId?: string | null;
  },
) {
  // tokensIn/Out = FATURALANAN BIRIM. Metin modellerinde jeton; seslendirmede
  // gonderilen karakter, cozumlemede yuklenen kilobayt. Fiyat satirlari
  // (ai_model_prices) her model icin ayni birimle yaziliyor.
  await service.from("ai_usage_events").insert({
    user_id: params.userId,
    action_code: params.actionCode,
    model: params.model,
    tokens_in: params.tokensIn,
    tokens_out: params.tokensOut,
    reservation_id: params.reservationId ?? null,
  });
}
