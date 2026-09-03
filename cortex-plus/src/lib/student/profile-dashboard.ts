import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toIsoDate } from "@/lib/learning/calendar";

/**
 * Profil panelinin verisi.
 *
 * Panel bir toplama yüzeyi: streak, davet, okul, plan ve mevcut sayfalara
 * giden kısayollar. Astra'da da avatar buna açılıyor.
 */

export type ProfileDay = {
  /** Pzt–Paz kısaltması. */
  label: string;
  iso: string;
  active: boolean;
  isToday: boolean;
};

export type ProfileDashboard = {
  fullName: string | null;
  schoolName: string | null;
  gradeLevel: string | null;
  currentStreak: number;
  longestStreak: number;
  week: ProfileDay[];
  /** Yaklaşan etkinlik sayısı — Takvimim kartındaki rozet. */
  upcomingEvents: number;
};

const DAY_LABELS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

/** Pazartesiden başlayan içinde bulunulan hafta. */
function weekDays(today = new Date()): { iso: string; label: string; isToday: boolean }[] {
  const base = new Date(today);
  base.setHours(0, 0, 0, 0);
  // getDay(): 0 = Pazar. Pazartesi başlangıcına çevir.
  const offset = (base.getDay() + 6) % 7;
  const monday = new Date(base);
  monday.setDate(base.getDate() - offset);

  return DAY_LABELS.map((label, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return { iso: toIsoDate(d), label, isToday: i === offset };
  });
}

export async function loadProfileDashboard(
  supabase: SupabaseClient,
  userId: string,
  today = new Date(),
): Promise<ProfileDashboard> {
  const days = weekDays(today);
  const weekStart = days[0].iso;
  const weekEnd = days[days.length - 1].iso;
  const todayIso = toIsoDate(today);

  const [{ data: profile }, { data: streak }, { data: activity }, { count }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, grade_level, school_id, schools(name)")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("user_streaks")
        .select("current_streak, longest_streak")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("user_activity_days")
        .select("activity_date")
        .eq("user_id", userId)
        .gte("activity_date", weekStart)
        .lte("activity_date", weekEnd),
      supabase
        .from("calendar_events")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("event_date", todayIso),
    ]);

  const activeDays = new Set(
    (activity ?? []).map((row) => String(row.activity_date)),
  );

  // schools(name) tek satırlık bir ilişki ama istemci tipi dizi de dönebiliyor.
  const schoolRel = (profile as { schools?: unknown } | null)?.schools;
  const schoolName = Array.isArray(schoolRel)
    ? ((schoolRel[0] as { name?: string })?.name ?? null)
    : ((schoolRel as { name?: string } | null)?.name ?? null);

  return {
    fullName: (profile?.full_name as string | null) ?? null,
    schoolName,
    gradeLevel: (profile?.grade_level as string | null) ?? null,
    currentStreak: streak?.current_streak ?? 0,
    longestStreak: streak?.longest_streak ?? 0,
    week: days.map((d) => ({ ...d, active: activeDays.has(d.iso) })),
    upcomingEvents: count ?? 0,
  };
}
