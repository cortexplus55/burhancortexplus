import { NextResponse } from "next/server";
import { withUser } from "@/lib/api/guards";
import { getUserStreakState } from "@/lib/streak/record-activity";

export async function GET(request: Request) {
  const guard = await withUser(request, { scope: "streak", limit: 60 });
  if (!guard.ok) return guard.response;
  const { supabase, userId } = guard.ctx;

  const state = await getUserStreakState(supabase, userId);
  return NextResponse.json({
    streak: state.streak,
    freezeAvailable: state.remaining > 0,
    freezeRemaining: state.remaining,
    freezeUsed: state.used,
    freezeProtected: state.protected,
  });
}
