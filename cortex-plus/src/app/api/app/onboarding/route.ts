import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { invalidateSessionUserContext } from "@/lib/auth/session-context";
import { isFeatureEnabled } from "@/lib/admin/feature-flags";
import { TEACHER_V2_FLAG } from "@/lib/ai/teacher-v2";
import { resolveLevelChoice } from "@/lib/platform/native-onboarding";

/**
 * Mobil uygulamanın açılış akışı (26 Kasım 2026, Aşama 1).
 * - GET: ön seçim için profildeki sınıf ve hedef; canlı sesli öğretmen bu öğrenciye açık mı (teacher.v2 bayrağı).
 * - POST: 1. adımın seçimi profile yazılır: sınıf `profiles.grade_level`, hedef öğrencinin ilk `learning_goals` satırı
 *   (yoksa eklenir). Öğretmen, ders ve test seviyeyi bu iki alandan okur. Yazım öğrencinin kendi oturumuyla
 *   (iki alan da tarayıcı yazma izin listesinde ve profil koruma tetikleyicisinin izin verdiği alanlarda).
 */

export async function GET(request: Request) {
  const guard = await withUser(request, { scope: "app-onboarding-read", limit: 20 });
  if (!guard.ok) return guard.response;
  const { supabase, service, userId } = guard.ctx;

  const [profile, goal, voiceTutor] = await Promise.all([
    supabase.from("profiles").select("grade_level, full_name").eq("id", userId).maybeSingle(),
    supabase.from("learning_goals").select("goal_text").eq("user_id", userId).order("created_at").limit(1).maybeSingle(),
    isFeatureEnabled(service, TEACHER_V2_FLAG, userId).catch(() => false),
  ]);
  const fullName = String((profile.data as { full_name?: string | null } | null)?.full_name ?? "").trim();
  return NextResponse.json({
    gradeLevel: (profile.data as { grade_level?: string | null } | null)?.grade_level ?? null,
    learningGoal: (goal.data as { goal_text?: string | null } | null)?.goal_text ?? null,
    firstName: fullName ? fullName.split(/\s+/)[0] : null,
    voiceTutor,
  });
}

const postSchema = z.object({ group: z.string().max(20), choice: z.string().max(20) });

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "app-onboarding-write", limit: 10, dailyLimit: 40 });
  if (!guard.ok) return guard.response;
  const { supabase, userId } = guard.ctx;

  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");
  const choice = resolveLevelChoice(parsed.data.group, parsed.data.choice);
  if (!choice) return errorResponse(400, "invalid_choice");

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ grade_level: choice.gradeLevel })
    .eq("id", userId);
  if (profileError) return errorResponse(500, "update_failed");

  const { data: goals } = await supabase
    .from("learning_goals")
    .select("id")
    .eq("user_id", userId)
    .order("created_at")
    .limit(1);
  const first = (goals ?? [])[0] as { id?: string } | undefined;
  const { error: goalError } = first?.id
    ? await supabase.from("learning_goals").update({ goal_text: choice.learningGoal }).eq("id", first.id).eq("user_id", userId)
    : await supabase.from("learning_goals").insert({ user_id: userId, goal_text: choice.learningGoal });
  if (goalError) return errorResponse(500, "goal_failed");

  await invalidateSessionUserContext(userId);
  return NextResponse.json({ ok: true, gradeLevel: choice.gradeLevel, learningGoal: choice.learningGoal });
}
