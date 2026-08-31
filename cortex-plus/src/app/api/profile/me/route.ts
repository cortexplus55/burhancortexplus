import { NextResponse } from "next/server";
import { z } from "zod";
import { readJson, withUser } from "@/lib/api/guards";

export async function GET(request: Request) {
  const guard = await withUser(request, { scope: "profile-read", limit: 60 });
  if (!guard.ok) return guard.response;
  const { userId, supabase } = guard.ctx;

  const { data } = await supabase
    .from("profiles")
    .select("school_name, daily_goal_minutes, learning_role, full_name")
    .eq("id", userId)
    .maybeSingle();

  return NextResponse.json({
    school_name: data?.school_name ?? "",
    daily_goal_minutes: data?.daily_goal_minutes ?? 3,
    learning_role: data?.learning_role ?? "student",
    full_name: data?.full_name ?? "",
  });
}

const patchSchema = z.object({
  school_name: z.string().max(200).optional(),
  daily_goal_minutes: z.number().int().min(1).max(30).optional(),
  learning_role: z.enum(["student", "graduate", "parent"]).optional(),
});

export async function PATCH(request: Request) {
  const guard = await withUser(request, { scope: "profile-write", limit: 20 });
  if (!guard.ok) return guard.response;
  const { userId, supabase } = guard.ctx;

  const parsed = patchSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const { error } = await supabase
    .from("profiles")
    .update(parsed.data)
    .eq("id", userId);

  if (error) {
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
