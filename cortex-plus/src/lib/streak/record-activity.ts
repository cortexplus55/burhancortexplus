import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isPremiumUser } from "@/lib/billing/entitlements";
import { addDays, isoWeekday } from "@/lib/istanbul-day";
import {
  FREE_FREEZES_PER_WEEK,
  STREAK_FREEZE_SOURCE,
  freezeAllowance,
  liveStreakWithFreeze,
  missedDayIfOneGap,
  nextStreakAfterActivity,
  type StreakFreezeView,
} from "@/lib/streak/streak-freeze";

/** Europe/Istanbul takvim gününe göre seriyi günceller. Bir günlük boşlukta kalkan varsa seriyi korur. */
export async function recordUserActivity(
  service: SupabaseClient,
  userId: string,
  source = "app",
): Promise<{ currentStreak: number; freezeUsed: boolean }> {
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

  const yesterday = istanbulDateString(addJsDays(new Date(), -1));
  const usedThisWeek = await countFreezesThisWeek(service, userId, today);
  const allowance = await weeklyAllowance(service, userId);
  const next = nextStreakAfterActivity({
    existing: existing
      ? { current: existing.current_streak ?? 0, last: existing.last_activity_date ?? null }
      : null,
    today,
    yesterday,
    canFreeze: usedThisWeek < allowance,
  });

  if (next.freezeUsed && next.missedDay) {
    await consumeFreeze(service, userId, next.missedDay);
  }

  const longest = Math.max(next.current, existing?.longest_streak ?? 0);

  await service.from("user_streaks").upsert(
    {
      user_id: userId,
      current_streak: next.current,
      longest_streak: longest,
      last_activity_date: today,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  return { currentStreak: next.current, freezeUsed: next.freezeUsed };
}

/*
  `current_streak` yalnızca çalışılan gün yazılıyor; öğrenci üç gün gelmezse
  satır eski sayıyla kalıyor ve üst çubuk kırılmış bir seriyi canlı
  gösteriyordu. Son çalışma günü dünden eskiyse seri 0'dır — bir günlük
  boşlukta kalkan varsa dünü doldururuz.
*/
export async function getUserStreak(
  service: SupabaseClient,
  userId: string,
  now = new Date(),
): Promise<number> {
  const state = await getUserStreakState(service, userId, now);
  return state.streak;
}

export async function getUserStreakState(
  service: SupabaseClient,
  userId: string,
  now = new Date(),
): Promise<StreakFreezeView> {
  const today = istanbulDateString(now);
  const { data } = await service
    .from("user_streaks")
    .select("current_streak, last_activity_date")
    .eq("user_id", userId)
    .maybeSingle();

  const current = data?.current_streak ?? 0;
  const last = data?.last_activity_date ? String(data.last_activity_date).slice(0, 10) : null;
  const usedThisWeek = await countFreezesThisWeek(service, userId, today);
  const allowance = await weeklyAllowance(service, userId);
  let remaining = Math.max(0, allowance - usedThisWeek);

  const missed = missedDayIfOneGap(last, today);
  let used = false;
  let lastForLive = last;
  if (missed && current >= 2 && remaining > 0) {
    const applied = await consumeFreeze(service, userId, missed);
    if (applied) {
      used = true;
      remaining = Math.max(0, remaining - 1);
      lastForLive = missed;
      await service
        .from("user_streaks")
        .update({ last_activity_date: missed, updated_at: new Date().toISOString() })
        .eq("user_id", userId);
    }
  }

  const live = liveStreakWithFreeze({ current, last: lastForLive, today, remaining });
  return {
    streak: live.streak,
    remaining,
    allowance,
    used,
    protected: live.protected || used,
  };
}

export function liveStreak(
  row: { current_streak?: number | null; last_activity_date?: string | null } | null,
  now = new Date(),
): number {
  if (!row?.last_activity_date) return row?.current_streak ?? 0;
  const today = istanbulDateString(now);
  const yesterday = istanbulDateString(addJsDays(now, -1));
  const last = String(row.last_activity_date).slice(0, 10);
  return last === today || last === yesterday ? (row.current_streak ?? 0) : 0;
}

async function weeklyAllowance(service: SupabaseClient, userId: string): Promise<number> {
  try {
    return freezeAllowance(await isPremiumUser(service, userId));
  } catch {
    return FREE_FREEZES_PER_WEEK;
  }
}

async function countFreezesThisWeek(service: SupabaseClient, userId: string, today: string): Promise<number> {
  const monday = addDays(today, 1 - isoWeekday(today));
  const sunday = addDays(monday, 6);
  try {
    const { count, error } = await service
      .from("user_activity_days")
      .select("activity_date", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("source", STREAK_FREEZE_SOURCE)
      .gte("activity_date", monday)
      .lte("activity_date", sunday);
    if (error) return 0;
    return Math.max(0, Number(count) || 0);
  } catch {
    return 0;
  }
}

async function consumeFreeze(service: SupabaseClient, userId: string, missedDay: string): Promise<boolean> {
  try {
    const { error } = await service.from("user_activity_days").upsert(
      { user_id: userId, activity_date: missedDay, source: STREAK_FREEZE_SOURCE },
      { onConflict: "user_id,activity_date", ignoreDuplicates: true },
    );
    return !error;
  } catch {
    return false;
  }
}

function istanbulDateString(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/Istanbul" });
}

function addJsDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}
