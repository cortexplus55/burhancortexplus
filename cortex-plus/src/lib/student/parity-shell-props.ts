import {
  astraUserInitial,
} from "@/components/parity/astra-app-utils";
import { getStudentAccountContext } from "@/lib/student/account-context";
import { getUserStreak } from "@/lib/streak/record-activity";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function loadParityShellProps(
  supabase: SupabaseClient,
  userId: string,
  email?: string | null,
) {
  const [{ data: profile }, account, streak] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, avatar_url")
      .eq("id", userId)
      .maybeSingle(),
    getStudentAccountContext(supabase, userId),
    getUserStreak(supabase, userId),
  ]);

  const avatar = profile?.avatar_url as string | null | undefined;

  return {
    userInitial: astraUserInitial(profile?.full_name, email),
    avatarEmoji: avatar && !avatar.startsWith("http") ? avatar : null,
    streak,
    account,
  };
}
