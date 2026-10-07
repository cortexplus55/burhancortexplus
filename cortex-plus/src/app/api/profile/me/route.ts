import { NextResponse } from "next/server";
import { AVATAR_OPTIONS } from "@/lib/parity/signup";
import { z } from "zod";
import { withUser } from "@/lib/api/guards";
import { todayKey } from "@/lib/learning/daily-drill";
import { parseTutorStyle } from "@/lib/learning/tutor-style";
import { DEFAULT_DAILY_GOAL, parseTutorVoice } from "@/lib/student/learning-prefs";

/*
  Ayarlar penceresinin (Hesabım / Okulum / Öğrenme tercihleri) tek okuma
  ve yazma ucu. Yeni tercih sütunları göç uygulanmadan okunursa sorgu
  düşmesin diye önce geniş, olmazsa eski sütunlarla okunuyor.
*/
const BASE_COLUMNS = "school_name, school_id, daily_goal_minutes, learning_role, full_name";
const FULL_COLUMNS = `${BASE_COLUMNS}, grade_level, tutor_style, avatar_url, show_suggestions, readable_font, tutor_voice`;

export async function GET(request: Request) {
  const guard = await withUser(request, { scope: "profile-read", limit: 60 });
  if (!guard.ok) return guard.response;
  const { supabase, userId } = guard.ctx;

  const full = await supabase.from("profiles").select(FULL_COLUMNS).eq("id", userId).maybeSingle();
  const data = (full.error
    ? (await supabase.from("profiles").select(BASE_COLUMNS).eq("id", userId).maybeSingle()).data
    : full.data) as Record<string, unknown> | null;

  // Günlük hedefin "bugün" tarafı: aktif öğrenme süresi (Türkiye günü).
  const { data: today } = await supabase
    .from("learning_time")
    .select("seconds")
    .eq("user_id", userId)
    .eq("activity_date", todayKey());
  const todaySeconds = (today ?? []).reduce((sum, row) => sum + Number(row.seconds ?? 0), 0);
  const avatar = (data?.avatar_url as string | null | undefined) ?? null;

  return NextResponse.json({
    school_name: (data?.school_name as string | null) ?? "",
    school_id: (data?.school_id as string | null) ?? null,
    daily_goal_minutes: Number(data?.daily_goal_minutes) >= 5 ? Number(data?.daily_goal_minutes) : DEFAULT_DAILY_GOAL,
    learning_role: (data?.learning_role as string | null) ?? "student",
    full_name: (data?.full_name as string | null) ?? "",
    grade_level: (data?.grade_level as string | null) ?? "",
    tutor_style: parseTutorStyle(data?.tutor_style),
    avatar_emoji: avatar && !avatar.startsWith("http") ? avatar : null,
    show_suggestions: data?.show_suggestions !== false,
    readable_font: data?.readable_font === true,
    tutor_voice: parseTutorVoice(data?.tutor_voice),
    today_minutes: Math.floor(todaySeconds / 60),
  });
}

const patchSchema = z.object({
  school_name: z.string().max(200).optional(),
  // Okul ağı gerçek bir referans gerektiriyor; serbest metin ad yalnızca
  // görüntüleme için korunuyor.
  school_id: z.string().uuid().nullable().optional(),
  // Dakika ("Bugün 12 / 30 dk"); 1 Ekim 2026'ya kadar 1–30 "soru sayısı"ydı.
  daily_goal_minutes: z.number().int().min(5).max(240).optional(),
  learning_role: z.enum(["student", "graduate", "parent"]).optional(),
  full_name: z.string().trim().min(1).max(80).optional(),
  grade_level: z.string().trim().max(40).optional(),
  tutor_style: z.enum(["step_by_step", "hints_first", "direct_solve"]).optional(),
  show_suggestions: z.boolean().optional(),
  readable_font: z.boolean().optional(),
  tutor_voice: z.enum(["female", "male"]).optional(),
  // Yalnızca kayıttaki emoji listesi ya da baş harfe dönüş (null). Serbest
  // metin kabul edilmez: avatar_url başka yerde görsel adresi olarak okunuyor.
  avatar_url: z
    .string()
    .refine((value) => AVATAR_OPTIONS.includes(value), "invalid_avatar")
    .nullable()
    .optional(),
});

export async function PATCH(request: Request) {
  const guard = await withUser(request, {
    scope: "profile-write",
    limit: 20,
    dailyLimit: 120,
  });
  if (!guard.ok) return guard.response;
  const { supabase, userId } = guard.ctx;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const { grade_level, ...rest } = parsed.data;
  const update = grade_level === undefined ? rest : { ...rest, grade_level: grade_level || null };

  const { error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", userId);

  if (error) {
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
