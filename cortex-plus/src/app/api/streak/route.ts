import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUserStreak } from "@/lib/streak/record-activity";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const streak = await getUserStreak(supabase, user.id);
  return NextResponse.json({ streak });
}
