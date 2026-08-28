import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { newIdempotencyKey } from "@/lib/credits/service";
import { PARENT_COACH_GRANT } from "@/lib/parent/constants";

export { PARENT_COACH_GRANT };

export async function getParentCoachRemaining(
  supabase: SupabaseClient,
  userId: string,
) {
  const { data } = await supabase
    .from("credit_wallets")
    .select("parent_coach_remaining")
    .eq("user_id", userId)
    .maybeSingle();
  return typeof data?.parent_coach_remaining === "number"
    ? data.parent_coach_remaining
    : PARENT_COACH_GRANT;
}

export async function spendParentCoach(
  service: SupabaseClient,
  userId: string,
) {
  const key = newIdempotencyKey("parent_coach");
  const { data, error } = await service.rpc("parent_coach_spend", {
    p_user_id: userId,
    p_idempotency_key: key,
  });
  if (error) {
    if (error.message.includes("insufficient")) {
      return { ok: false as const, reason: "insufficient_credits" as const, key };
    }
    return { ok: false as const, reason: "error" as const, key };
  }
  return {
    ok: true as const,
    remaining: Number(data ?? 0),
    key,
  };
}

export async function refundParentCoach(
  service: SupabaseClient,
  userId: string,
  key: string,
) {
  await service.rpc("parent_coach_refund", {
    p_user_id: userId,
    p_idempotency_key: key,
  });
}
