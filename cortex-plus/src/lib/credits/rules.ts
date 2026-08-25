import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ActionCode } from "@/lib/env";

export async function getCreditCost(actionCode: ActionCode): Promise<number | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("credit_rules")
      .select("credit_cost")
      .eq("action_code", actionCode)
      .eq("active", true)
      .maybeSingle();
    return data?.credit_cost ?? null;
  } catch {
    return null;
  }
}
