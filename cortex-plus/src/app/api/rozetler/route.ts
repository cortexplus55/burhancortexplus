import { NextResponse } from "next/server";
import { withUser } from "@/lib/api/guards";
import { buildBadgeJourney } from "@/lib/gamification/badges";
import { loadBadgeFacts } from "@/lib/gamification/load-badge-facts";
import { todayKey } from "@/lib/learning/daily-drill";
import { DEFAULT_DAILY_GOAL } from "@/lib/student/learning-prefs";

/** Seri ve rozet yolculuğu — üst çubuktaki seri düğmesinin açtığı pencere. */
export async function GET(request: Request) {
  const guard = await withUser(request, { scope: "badges", limit: 30 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const [facts, { data: profile }, { data: today }] = await Promise.all([
    loadBadgeFacts(service, userId),
    service.from("profiles").select("daily_goal_minutes").eq("id", userId).maybeSingle(),
    service.from("learning_time").select("seconds").eq("user_id", userId).eq("activity_date", todayKey()),
  ]);
  const goal = Number(profile?.daily_goal_minutes);
  const todaySeconds = (today ?? []).reduce((sum, row) => sum + Number(row.seconds ?? 0), 0);
  return NextResponse.json({
    ...buildBadgeJourney(facts),
    dailyGoal: {
      goalMinutes: goal >= 5 ? goal : DEFAULT_DAILY_GOAL,
      todayMinutes: Math.floor(todaySeconds / 60),
    },
  });
}
