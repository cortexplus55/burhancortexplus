"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  getTeacherEntitlements,
  incrementTeacherUsage,
} from "@/lib/teacher/entitlements";

async function requireTeacherActor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .is("revoked_at", null);

  const roleList = (roles ?? []).map((r) => r.role as string);
  const allowed =
    roleList.includes("teacher") ||
    roleList.includes("verified_teacher") ||
    roleList.includes("admin");
  if (!allowed) return null;

  const entitlements = await getTeacherEntitlements(
    supabase,
    user.id,
    roleList,
  );
  if (!entitlements) return null;

  return { supabase, userId: user.id, entitlements, service: createServiceClient() };
}

function generateJoinCode() {
  return randomBytes(3).toString("hex").toUpperCase();
}

export async function createClassroom(formData: FormData) {
  const actor = await requireTeacherActor();
  if (!actor) return { ok: false, error: "Yetkisiz işlem." };

  const parsed = z
    .object({ name: z.string().min(2).max(80) })
    .safeParse({ name: formData.get("name") });
  if (!parsed.success) return { ok: false, error: "Sınıf adı geçersiz." };

  const { count } = await actor.supabase
    .from("classrooms")
    .select("id", { count: "exact", head: true })
    .eq("teacher_id", actor.userId);

  if (!actor.entitlements.canCreateClassroom(count ?? 0)) {
    return {
      ok: false,
      error: "plus_required",
      message: "Ücretsiz planda en fazla 1 sınıf açabilirsin. Plus ile sınırsız sınıf.",
    };
  }

  const { error } = await actor.supabase.from("classrooms").insert({
    teacher_id: actor.userId,
    name: parsed.data.name,
    join_code: generateJoinCode(),
  });

  revalidatePath("/ogretmen-paneli/siniflar");
  revalidatePath("/ogretmen-paneli");
  return { ok: !error, error: error ? "Sınıf oluşturulamadı." : undefined };
}

export async function createAssignment(formData: FormData) {
  const actor = await requireTeacherActor();
  if (!actor) return { ok: false, error: "Yetkisiz işlem." };

  const parsed = z
    .object({
      classroomId: z.string().uuid(),
      title: z.string().min(2).max(150),
      description: z.string().max(2000).optional(),
      dueAt: z.string().optional(),
      quizId: z.string().uuid().optional(),
    })
    .safeParse({
      classroomId: formData.get("classroomId"),
      title: formData.get("title"),
      description: formData.get("description") ?? undefined,
      dueAt: formData.get("dueAt") ?? undefined,
      quizId: formData.get("quizId") || undefined,
    });

  if (!parsed.success) return { ok: false, error: "Ödev bilgileri geçersiz." };

  if (parsed.data.quizId && !actor.entitlements.canAttachQuizToAssignment()) {
    return {
      ok: false,
      error: "plus_required",
      message: "Quiz bağlamak için Cortex Plus gerekir.",
    };
  }

  if (!actor.entitlements.canCreateAssignment()) {
    return {
      ok: false,
      error: "trial_exhausted",
      message: "Deneme ödev hakkın doldu. Doğrulama sonrası sınırsız temel ödev açılır.",
    };
  }

  const { data: classroom } = await actor.supabase
    .from("classrooms")
    .select("id")
    .eq("id", parsed.data.classroomId)
    .eq("teacher_id", actor.userId)
    .maybeSingle();

  if (!classroom) return { ok: false, error: "Sınıf bulunamadı." };

  const { error } = await actor.supabase.from("assignments").insert({
    classroom_id: parsed.data.classroomId,
    title: parsed.data.title,
    description: parsed.data.description || null,
    due_at: parsed.data.dueAt ? new Date(parsed.data.dueAt).toISOString() : null,
    quiz_id: parsed.data.quizId ?? null,
  });

  if (!error && actor.entitlements.tier === "pending") {
    await incrementTeacherUsage(actor.service, actor.userId, "assignments_created");
  }

  revalidatePath("/ogretmen-paneli/odevler");
  revalidatePath("/ogretmen-paneli");
  return { ok: !error, error: error ? "Ödev oluşturulamadı." : undefined };
}

export async function removeClassroomMember(formData: FormData) {
  const actor = await requireTeacherActor();
  if (!actor) return { ok: false, error: "Yetkisiz işlem." };

  const parsed = z
    .object({
      memberId: z.string().uuid(),
      classroomId: z.string().uuid(),
    })
    .safeParse({
      memberId: formData.get("memberId"),
      classroomId: formData.get("classroomId"),
    });

  if (!parsed.success) return { ok: false, error: "Geçersiz istek." };

  const { data: classroom } = await actor.supabase
    .from("classrooms")
    .select("id")
    .eq("id", parsed.data.classroomId)
    .eq("teacher_id", actor.userId)
    .maybeSingle();

  if (!classroom) return { ok: false, error: "Sınıf bulunamadı." };

  const { error } = await actor.supabase
    .from("classroom_members")
    .delete()
    .eq("id", parsed.data.memberId)
    .eq("classroom_id", parsed.data.classroomId);

  revalidatePath("/ogretmen-paneli/ogrenciler");
  return { ok: !error, error: error ? "Öğrenci çıkarılamadı." : undefined };
}

export async function recordTeacherReportView() {
  const actor = await requireTeacherActor();
  if (!actor) return { ok: false, error: "Yetkisiz işlem." };

  if (!actor.entitlements.canViewReports()) {
    return { ok: false, error: "trial_exhausted" };
  }

  if (actor.entitlements.tier === "pending") {
    await incrementTeacherUsage(actor.service, actor.userId, "reports_viewed");
  }

  return { ok: true };
}

export async function recordTeacherQuizGenerated() {
  const actor = await requireTeacherActor();
  if (!actor) return { ok: false, error: "Yetkisiz işlem." };

  if (!actor.entitlements.canGenerateQuiz()) {
    return { ok: false, error: "locked" };
  }

  if (actor.entitlements.tier === "pending") {
    await incrementTeacherUsage(actor.service, actor.userId, "quizzes_generated");
  }

  return { ok: true };
}

export async function shareQuizAsAssignment(formData: FormData) {
  const actor = await requireTeacherActor();
  if (!actor) return { ok: false, error: "Yetkisiz işlem." };

  if (!actor.entitlements.canAttachQuizToAssignment()) {
    return { ok: false, error: "plus_required" };
  }

  const parsed = z
    .object({
      classroomId: z.string().uuid(),
      quizId: z.string().uuid(),
      title: z.string().min(2).max(150),
    })
    .safeParse({
      classroomId: formData.get("classroomId"),
      quizId: formData.get("quizId"),
      title: formData.get("title"),
    });

  if (!parsed.success) return { ok: false, error: "Geçersiz istek." };

  const { data: quiz } = await actor.supabase
    .from("quizzes")
    .select("id")
    .eq("id", parsed.data.quizId)
    .eq("user_id", actor.userId)
    .maybeSingle();

  if (!quiz) return { ok: false, error: "Quiz bulunamadı." };

  const fd = new FormData();
  fd.set("classroomId", parsed.data.classroomId);
  fd.set("title", parsed.data.title);
  fd.set("quizId", parsed.data.quizId);
  return createAssignment(fd);
}
