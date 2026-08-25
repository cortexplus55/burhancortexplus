import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Europe/Istanbul takvim gününe göre seriyi günceller. */
export async function recordUserActivity(
  service: SupabaseClient,
  userId: string,
  source = "app",
): Promise<{ currentStreak: number }> {
  const today = istanbulDateString(new Date());

  await service.from("user_activity_days").upsert(
    { user_id: userId, activity_date: today, source },
    { onConflict: "user_id,activity_date", ignoreDuplicates: true },
  );

  const { data: existing } = await service
    .from("user_streaks")
    .select("current_streak, longest_streak, last_activity_date")
    .eq("user_id", userId)
    .maybeSingle();

  const yesterday = istanbulDateString(addDays(new Date(), -1));

  let current = 1;
  if (existing?.last_activity_date === today) {
    current = existing.current_streak ?? 1;
  } else if (existing?.last_activity_date === yesterday) {
    current = (existing.current_streak ?? 0) + 1;
  }

  const longest = Math.max(current, existing?.longest_streak ?? 0);

  await service.from("user_streaks").upsert(
    {
      user_id: userId,
      current_streak: current,
      longest_streak: longest,
      last_activity_date: today,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  return { currentStreak: current };
}

export async function getUserStreak(
  service: SupabaseClient,
  userId: string,
): Promise<number> {
  const { data } = await service
    .from("user_streaks")
    .select("current_streak")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.current_streak ?? 0;
}

function istanbulDateString(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}
