"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

async function currentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function togglePlanTask(taskId: string, completed: boolean) {
  const parsed = z.string().uuid().safeParse(taskId);
  const { supabase, user } = await currentUser();
  if (!parsed.success || !user) return { ok: false };

  // RLS scopes the update to plans owned by the caller.
  const { error } = await supabase
    .from("study_plan_tasks")
    .update({ completed })
    .eq("id", parsed.data);

  revalidatePath("/calisma-plani");
  return { ok: !error };
}

export async function markNotificationRead(notificationId: string) {
  const parsed = z.string().uuid().safeParse(notificationId);
  const { supabase, user } = await currentUser();
  if (!parsed.success || !user) return { ok: false };

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", parsed.data)
    .eq("user_id", user.id);

  revalidatePath("/bildirimler");
  return { ok: !error };
}

const profileSchema = z.object({
  fullName: z.string().min(2).max(120),
  gradeLevel: z.string().max(40).optional(),
  locale: z.enum(["tr", "en"]).default("tr"),
  tutorStyle: z
    .enum(["step_by_step", "hints_first", "direct_solve"])
    .optional(),
});

export async function updateProfile(formData: FormData) {
  const { supabase, user } = await currentUser();
  if (!user) return { ok: false, error: "Giriş gerekli." };

  const parsed = profileSchema.safeParse({
    fullName: formData.get("fullName"),
    gradeLevel: formData.get("gradeLevel") ?? undefined,
    locale: formData.get("locale") ?? "tr",
    tutorStyle: formData.get("tutorStyle") ?? undefined,
  });

  if (!parsed.success) return { ok: false, error: "Bilgiler geçersiz." };

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      grade_level: parsed.data.gradeLevel || null,
      locale: parsed.data.locale,
      ...(parsed.data.tutorStyle
        ? { tutor_style: parsed.data.tutorStyle }
        : {}),
    })
    .eq("id", user.id);

  revalidatePath("/profil");
  return { ok: !error, error: error ? "Kaydedilemedi." : undefined };
}

export async function requestDataDeletion() {
  const { supabase, user } = await currentUser();
  if (!user) return { ok: false };

  const { error } = await supabase.from("data_deletion_requests").insert({
    user_id: user.id,
  });

  revalidatePath("/ayarlar");
  return { ok: !error };
}
