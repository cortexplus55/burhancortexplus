"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { parseParentProfileUpdate } from "@/lib/parent/profile";

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

export async function markAllNotificationsRead() {
  const { supabase, user } = await currentUser();
  if (!user) return { ok: false };

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("primary_role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.primary_role === "parent") {
    const parsed = parseParentProfileUpdate({
      fullName: formData.get("fullName"),
      locale: formData.get("locale") ?? "tr",
      parentRelation: formData.get("parentRelation"),
      phone: formData.get("phone") ?? "",
    });
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: parsed.data.fullName,
        locale: parsed.data.locale,
        parent_relation: parsed.data.parentRelation,
        phone: parsed.data.phone,
      })
      .eq("id", user.id);

    revalidatePath("/profil");
    revalidatePath("/veli");
    revalidatePath("/ayarlar");
    return { ok: !error, error: error ? "Kaydedilemedi." : undefined };
  }

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
  if (error) {
    revalidatePath("/ayarlar");
    return { ok: false };
  }

  // Talebi kuyruğa aldıktan sonra hemen işle — "sıra var ama kimse işlemiyor"
  // durumunu kapatır. Başarısız olursa cron tekrar dener.
  try {
    const { createServiceClient } = await import("@/lib/supabase/server");
    const { purgeUserData } = await import("@/lib/privacy/account-deletion");
    const service = createServiceClient();
    const result = await purgeUserData(service, user.id);
    if (result.ok) {
      await service
        .from("data_deletion_requests")
        .update({ processed_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .is("processed_at", null);
    } else {
      console.error("data_deletion_immediate_failed", {
        userId: user.id,
        error: result.error,
      });
    }
  } catch (err) {
    console.error("data_deletion_immediate_failed", {
      userId: user.id,
      message: err instanceof Error ? err.message : "unknown",
    });
  }

  revalidatePath("/ayarlar");
  return { ok: true };
}
