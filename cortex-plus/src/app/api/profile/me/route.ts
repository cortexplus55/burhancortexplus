import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data } = await supabase
    .from("profiles")
    .select("school_name, school_id, daily_goal_minutes, learning_role, full_name")
    .eq("id", user.id)
    .maybeSingle();

  return NextResponse.json({
    school_name: data?.school_name ?? "",
    school_id: data?.school_id ?? null,
    daily_goal_minutes: data?.daily_goal_minutes ?? 3,
    learning_role: data?.learning_role ?? "student",
    full_name: data?.full_name ?? "",
  });
}

const patchSchema = z.object({
  school_name: z.string().max(200).optional(),
  // Okul ağı gerçek bir referans gerektiriyor; serbest metin ad yalnızca
  // görüntüleme için korunuyor.
  school_id: z.string().uuid().nullable().optional(),
  daily_goal_minutes: z.number().int().min(1).max(30).optional(),
  learning_role: z.enum(["student", "graduate", "parent"]).optional(),
});

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const { error } = await supabase
    .from("profiles")
    .update(parsed.data)
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
