import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isPremiumUser } from "@/lib/ai/generate";

export type StudentAccountContext = {
  balance: number;
  freeAllowanceRemaining: number;
  isPremium: boolean;
  canSpend: boolean;
};

export async function getStudentAccountContext(
  supabase: SupabaseClient,
  userId: string,
): Promise<StudentAccountContext> {
  const [{ data: wallet }, isPremium] = await Promise.all([
    supabase
      .from("credit_wallets")
      .select("balance, free_allowance_remaining")
      .eq("user_id", userId)
      .maybeSingle(),
    isPremiumUser(supabase, userId),
  ]);

  const balance = wallet?.balance ?? 0;
  const freeAllowanceRemaining = wallet?.free_allowance_remaining ?? 0;

  return {
    balance,
    freeAllowanceRemaining,
    isPremium,
    canSpend: balance > 0 || freeAllowanceRemaining > 0,
  };
}
