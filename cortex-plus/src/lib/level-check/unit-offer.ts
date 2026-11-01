import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { poolUnit } from "@/lib/content-pool/keys";
import { poolIdFromSetupId, UNIT_CHECK_MIN } from "@/lib/level-check/select";
import { unitCheckDone } from "@/lib/level-check/store";

/**
 * Hazırlık yolunda etkin konu resmî kurulumdan bir üniteyse ve havuzda en az 3 doğrulanmış soru varsa Ünite Seviye
 * Kontrolü önerilir. Bu hazırlıkta yapıldıysa ya da tablolar henüz yoksa (göç uygulanmadı) önerilmez.
 */
export async function unitCheckOffer(
  service: SupabaseClient,
  input: { userId: string; prepId: string; prefs: unknown; topicLabel: string | null },
): Promise<{ unitId: string; unitTitle: string } | null> {
  try {
    if (!input.topicLabel) return null;
    const units = (input.prefs as { officialPlan?: { units?: { topic: string; unitId: string }[] } } | null)?.officialPlan?.units;
    const label = input.topicLabel.replace(/\s+/g, " ").trim();
    const hit = Array.isArray(units) ? units.find((u) => u?.topic === label) : undefined;
    const poolId = hit ? poolIdFromSetupId(hit.unitId) : null;
    const unit = poolId ? poolUnit(poolId) : null;
    if (!poolId || !unit) return null;
    const { error: tableError } = await service.from("item_responses").select("id").limit(1);
    if (tableError) return null;
    const { count } = await service
      .from("item_bank")
      .select("id", { count: "exact", head: true })
      .eq("unit_id", poolId)
      .eq("status", "verified");
    if ((count ?? 0) < UNIT_CHECK_MIN) return null;
    if (await unitCheckDone(service, input.userId, poolId, input.prepId)) return null;
    return { unitId: poolId, unitTitle: unit.unit.title };
  } catch {
    return null;
  }
}
