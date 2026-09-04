import {
  astraUserInitial,
} from "@/components/parity/astra-app-utils";
import { getStudentAccountContext } from "@/lib/student/account-context";
import { getUserStreak } from "@/lib/streak/record-activity";
import { loadPromoCampaign } from "@/lib/student/promo-campaign";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function loadParityShellProps(
  supabase: SupabaseClient,
  userId: string,
  email?: string | null,
) {
  const [{ data: profile }, account, streak, promo] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, avatar_url")
      .eq("id", userId)
      .maybeSingle(),
    getStudentAccountContext(supabase, userId),
    getUserStreak(supabase, userId),
    loadPromoCampaign(supabase),
  ]);

  const avatar = profile?.avatar_url as string | null | undefined;

  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, title, updated_at")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(5);

  return {
    userInitial: astraUserInitial(profile?.full_name, email),
    avatarEmoji: avatar && !avatar.startsWith("http") ? avatar : null,
    streak,
    account,
    promo,
    recentConversations: (conversations ?? []).map((row) => ({
      id: row.id as string,
      title: (row.title as string | null) ?? "Yeni sohbet",
      updatedAt: row.updated_at as string,
    })),
  };
}
