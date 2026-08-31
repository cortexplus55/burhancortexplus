import { NextResponse } from "next/server";
import { withUser } from "@/lib/api/guards";
import { getUserStreak } from "@/lib/streak/record-activity";

export async function GET(request: Request) {
  const guard = await withUser(request, { scope: "streak", limit: 60 });
  if (!guard.ok) return guard.response;
  const { userId, supabase } = guard.ctx;

  const streak = await getUserStreak(supabase, userId);
  return NextResponse.json({ streak });
}
