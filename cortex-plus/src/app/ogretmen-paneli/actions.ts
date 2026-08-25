"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

async function requireTeacherActor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .in("role", ["verified_teacher", "admin"])
    .is("revoked_at", null)
    .limit(1);

  return data?.length ? { supabase, userId: user.id } : null;
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

  const { error } = await actor.supabase.from("classrooms").insert({
    teacher_id: actor.userId,
    name: parsed.data.name,
    join_code: generateJoinCode(),
  });

  revalidatePath("/ogretmen-paneli/siniflar");
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
    })
    .safeParse({
      classroomId: formData.get("classroomId"),
      title: formData.get("title"),
      description: formData.get("description") ?? undefined,
      dueAt: formData.get("dueAt") ?? undefined,
    });

  if (!parsed.success) return { ok: false, error: "Ödev bilgileri geçersiz." };

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
  });

  revalidatePath("/ogretmen-paneli/odevler");
  return { ok: !error, error: error ? "Ödev oluşturulamadı." : undefined };
}
