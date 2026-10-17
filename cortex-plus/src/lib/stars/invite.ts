import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getUserEntitlements } from "@/lib/billing/entitlements";
import { awardStars } from "@/lib/stars/award";
import { INVITE_SUBSCRIBED_STARS } from "@/lib/stars/rules";

/**
 * "Arkadaşın abone olsun — 300" (Astra). Ödeme tamamlanınca: ödeyen davetle
 * gelmişse ve artık etkin bir ücretli aboneliği varsa davet edene bir kez.
 * Yenilemeler ve ek paketler ikinci kez saymaz (ref davet edilenin kimliği).
 */
export async function awardInviteSubscribed(service: SupabaseClient, inviteeId: string): Promise<number> {
  try {
    const { data: profile } = await service.from("profiles").select("referred_by").eq("id", inviteeId).maybeSingle();
    const inviter = (profile?.referred_by as string | null) ?? null;
    if (!inviter || inviter === inviteeId) return 0;
    if (!(await getUserEntitlements(service, inviteeId)).isPremium) return 0;
    return awardStars(service, { userId: inviter, source: "invite_subscribed", ref: inviteeId, amount: INVITE_SUBSCRIBED_STARS });
  } catch {
    return 0;
  }
}
