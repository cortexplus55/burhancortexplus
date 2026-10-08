import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, istanbulDay, isoWeekday } from "@/lib/istanbul-day";
import { liveStreak } from "@/lib/streak/record-activity";

/**
 * Profil panelinin verisi.
 *
 * Panel bir toplama yüzeyi: streak, davet, okul, plan ve mevcut sayfalara
 * giden kısayollar. Referans üründe de avatar buna açılıyor.
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
  /** Kayıtta ya da profilde seçilen emoji; yoksa baş harf gösterilir. */
  avatarEmoji: string | null;
};

const DAY_LABELS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

/**
 * Pazartesiden başlayan içinde bulunulan hafta, Türkiye takviminde.
 *
 * Sunucu UTC'de; yerel saatle hesaplandığında gece 00:00–03:00 arası "bugün"
 * dün oluyordu ve pazartesi gecesi şerit bütünüyle geçen haftayı
 * gösteriyordu. `user_activity_days` zaten Türkiye gününe yazılıyor.
 */
function weekDays(todayIso: string): { iso: string; label: string; isToday: boolean }[] {
  const offset = isoWeekday(todayIso) - 1;
  const monday = addDays(todayIso, -offset);
  return DAY_LABELS.map((label, i) => ({
    iso: addDays(monday, i),
    label,
    isToday: i === offset,
  }));
}

export async function loadProfileDashboard(
  supabase: SupabaseClient,
  userId: string,
  today = new Date(),
): Promise<ProfileDashboard> {
  const todayIso = istanbulDay(today);
  const days = weekDays(todayIso);
  const weekStart = days[0].iso;
  const weekEnd = days[days.length - 1].iso;

  const [{ data: profile }, { data: streak }, { data: activity }, { count }, { count: examCount }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, grade_level, school_id, avatar_url, schools(name)")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .from("user_streaks")
        .select("current_streak, longest_streak, last_activity_date")
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
      // Takvim sayfası sınav tarihlerini de "Yaklaşan"da gösteriyor; rozet
      // yalnızca kişisel etkinliği sayınca 7 sınav varken boş kalıyordu.
      supabase
        .from("exam_preps")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("exam_date", todayIso),
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
    currentStreak: liveStreak(streak, today),
    longestStreak: streak?.longest_streak ?? 0,
    week: days.map((d) => ({ ...d, active: activeDays.has(d.iso) })),
    upcomingEvents: (count ?? 0) + (examCount ?? 0),
    avatarEmoji: (() => {
      const avatar = (profile as { avatar_url?: string | null } | null)?.avatar_url ?? null;
      return avatar && !avatar.startsWith("http") ? avatar : null;
    })(),
  };
}
