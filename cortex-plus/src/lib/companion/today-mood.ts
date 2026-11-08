import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { moodAskedSince } from "@/lib/learning/lesson-open";
import { parseMood, type Mood } from "@/lib/learning/session-signals";
import { istanbulDay } from "@/lib/istanbul-day";

/**
 * Günün ruh hali tek kaynaktan (8 Kasım 2026): derste işaretlenen (`study_session_moods`, düğüm kaydıyla) ve
 * sohbetteki hap aynı tabloya yazar; ana ekran, sohbet ve dersler aynı yerden okur. Önce sohbetin ruh hali yalnız
 * tarayıcıda duruyordu, ders her gün yeniden soruyordu.
 */
export async function loadTodayMood(supabase: SupabaseClient, userId: string): Promise<Mood | null> {
  const { data } = await supabase
    .from("study_session_moods")
    .select("mood")
    .eq("user_id", userId)
    .gte("created_at", moodAskedSince())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.mood ? parseMood(data.mood) : null;
}

/** Sohbetten ya da ana ekrandan işaretlenen ruh hali; hazırlık ve düğüm yok. */
export async function saveTodayMood(service: SupabaseClient, userId: string, mood: Mood): Promise<boolean> {
  const { error } = await service.from("study_session_moods").insert({ user_id: userId, mood });
  return !error;
}

export type ActivityDays = {
  /** Son çalışmadan beri geçen tam gün (Türkiye günü); hiç yoksa null. */
  daysSinceLast: number | null;
  /** Canlı seri. */
  streak: number;
};

function dayDiff(fromIso: string, toIso: string): number {
  const a = new Date(`${fromIso}T12:00:00Z`).getTime();
  const b = new Date(`${toIso}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Seri satırından: son çalışma günü ve canlı seri. Okuma düşerse "bilinmiyor" (null / 0). */
export async function loadActivityDays(supabase: SupabaseClient, userId: string, now = new Date()): Promise<ActivityDays> {
  const { data } = await supabase
    .from("user_streaks")
    .select("current_streak, last_activity_date")
    .eq("user_id", userId)
    .maybeSingle();
  const last = data?.last_activity_date ? String(data.last_activity_date).slice(0, 10) : null;
  if (!last) return { daysSinceLast: null, streak: 0 };
  const diff = Math.max(0, dayDiff(last, istanbulDay(now)));
  const streak = diff <= 1 ? Number(data?.current_streak ?? 0) : 0;
  return { daysSinceLast: diff, streak };
}
