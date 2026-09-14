import "server-only";
import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionCode } from "@/lib/env";

export type ReservationResult =
  | { ok: true; reservationId: string; cost: number }
  | { ok: false; reason: "insufficient_credits" | "invalid_action" | "error" };

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
): Promise<ReservationResult> {
  const cost = await getActionCost(service, actionCode);
  if (cost === null) return { ok: false, reason: "invalid_action" };

  const { data, error } = await service.rpc("credit_reserve", {
    p_user_id: userId,
    p_action_code: actionCode,
    p_idempotency_key: idempotencyKey,
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

  return { ok: true, reservationId: data as string, cost };
}

export async function commitCredits(
  service: SupabaseClient,
  reservationId: string,
) {
  await service.rpc("credit_commit", { p_reservation_id: reservationId });
}

export async function refundCredits(
  service: SupabaseClient,
  reservationId: string,
) {
  await service.rpc("credit_refund", { p_reservation_id: reservationId });
}

/**
 * Sesin kendi eylem kodlari.
 *
 * Seslendirme ve cozumleme krediden dusmuyor (bedeli dugume dahil), bu yuzden
 * `ActionCode` birligine girmiyorlar — ama maliyeti olan tek kalem olmalari
 * onlari olculmesi en gerekli yer yapiyor. `ai_usage_events.action_code`
 * serbest metin oldugu icin sema degisikligi gerekmiyor.
 */
export type UsageCode = ActionCode | "TTS_SYNTHESIZE" | "STT_TRANSCRIBE";

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
