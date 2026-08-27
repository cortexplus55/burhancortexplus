"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { homePathForRole } from "@/lib/parity/signup";
import {
  sendParentInviteEmail,
  sendParentRequestEmail,
} from "@/lib/email/mailer";

const payloadSchema = z.object({
  role: z.enum(["student", "parent", "teacher"]),
  fullName: z.string().min(2).max(120),
  gradeLevel: z.string().max(40).optional(),
  schoolName: z.string().max(160).optional(),
  focusSubject: z.string().max(60).optional(),
  learningGoal: z.string().max(120).optional(),
  avatarEmoji: z.string().max(8).optional(),
  parentLinkMode: z.enum(["code", "email", "later"]).optional(),
  parentInviteCode: z.string().max(12).optional(),
  parentInviteEmail: z.string().email().max(160).optional(),
  teacherInstitution: z.string().max(160).optional(),
  teacherBranch: z.string().max(80).optional(),
  teacherClassName: z.string().max(80).optional(),
});

export type CompleteSignupResult =
  | { ok: true; redirectTo: string; linkWarning?: string }
  | { ok: false; error: string };

export async function completeSignup(
  input: unknown,
): Promise<CompleteSignupResult> {
  try {
    return await completeSignupInner(input);
  } catch (err) {
    console.error("[completeSignup]", err);
    return {
      ok: false,
      error:
        "Kayıt tamamlanırken beklenmeyen bir hata oluştu. Birkaç saniye sonra tekrar dene.",
    };
  }
}

async function completeSignupInner(
  input: unknown,
): Promise<CompleteSignupResult> {
  const parsed = payloadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Bilgiler geçersiz." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Oturum bulunamadı." };

  const payload = parsed.data;

  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      id: user.id,
      full_name: payload.fullName,
      grade_level: payload.gradeLevel ?? null,
      school_name: payload.schoolName ?? payload.teacherInstitution ?? null,
      focus_subject: payload.focusSubject ?? payload.teacherBranch ?? null,
      avatar_url: payload.avatarEmoji ?? null,
      primary_role: payload.role,
      onboarding_completed_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (profileError) {
    console.error("[completeSignup] profile", profileError);
    return { ok: false, error: "Profil kaydedilemedi." };
  }

  if (payload.role === "student" && payload.learningGoal) {
    const { data: existingGoals } = await supabase
      .from("learning_goals")
      .select("id")
      .eq("user_id", user.id)
      .limit(1);
    if (!existingGoals?.length) {
      await supabase
        .from("learning_goals")
        .insert({ user_id: user.id, goal_text: payload.learningGoal });
    }
  }

  let linkWarning: string | undefined;
  if (payload.role === "parent") {
    const result = await linkChildInternal(user.id, payload);
    if (!result.ok) linkWarning = result.error;
  }

  if (payload.role === "student" && user.email) {
    await claimPendingInvites(user.id, user.email);
  }

  if (payload.role === "teacher") {
    await createTeacherApplication(
      user.id,
      payload.teacherInstitution ?? "Belirtilmedi",
    );
    if (payload.teacherClassName?.trim()) {
      await createTeacherClassroom(
        user.id,
        payload.teacherClassName.trim(),
      );
    }
  }

  revalidatePath("/", "layout");
  return { ok: true, redirectTo: homePathForRole(payload.role), linkWarning };
}


async function linkChildInternal(
  parentId: string,
  payload: z.infer<typeof payloadSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (payload.parentLinkMode === "code" && payload.parentInviteCode) {
    return createCodeLink(parentId, payload.parentInviteCode);
  }

  if (payload.parentLinkMode === "email" && payload.parentInviteEmail) {
    return createEmailInvite(parentId, payload.parentInviteEmail);
  }

  return { ok: true };
}

async function createCodeLink(
  parentId: string,
  rawCode: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const code = rawCode.trim().toUpperCase();

  const { data: student } = await supabase
    .from("profiles")
    .select("id")
    .eq("invite_code", code)
    .maybeSingle();

  if (!student) {
    return {
      ok: false,
      error: "Davet kodu bulunamadı. Sonra tekrar deneyebilirsin.",
    };
  }
  if (student.id === parentId) {
    return { ok: false, error: "Kendi kodunu kullanamazsın." };
  }

  const { error } = await supabase.from("parent_student_links").insert({
    parent_id: parentId,
    student_id: student.id,
    status: "pending",
  });

  if (error) {
    return { ok: false, error: "Bu öğrenci için zaten bir isteğin var." };
  }

  await notifyStudentOfRequest(parentId, student.id);
  return { ok: true };
}

async function createEmailInvite(
  parentId: string,
  rawEmail: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const email = rawEmail.trim().toLowerCase();

  const { error } = await supabase.from("parent_student_links").insert({
    parent_id: parentId,
    invite_email: email,
    status: "pending",
  });

  if (error) return { ok: false, error: "Davet oluşturulamadı." };

  const parentName = await displayName(parentId);
  const sent = await sendParentInviteEmail({ to: email, parentName });

  if (!sent.ok) {
    return {
      ok: false,
      error:
        sent.reason === "email_not_configured"
          ? "Davet kaydedildi ama e-posta gönderimi yapılandırılmamış."
          : "Davet kaydedildi ama e-posta gönderilemedi.",
    };
  }

  return { ok: true };
}

async function displayName(userId: string) {
  const service = createServiceClient();
  const { data } = await service
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();
  return (data?.full_name as string | null)?.trim() || "Bir veli";
}

/** Bildirim + e-posta; öğrenci onaylayana kadar veli hiçbir veriyi göremez. */
async function notifyStudentOfRequest(parentId: string, studentId: string) {
  const service = createServiceClient();
  const parentName = await displayName(parentId);

  await service.from("notifications").insert({
    user_id: studentId,
    title: "Yeni veli bağlantı isteği",
    body: `${parentName} hesabına veli olarak bağlanmak istiyor. Profil sayfandan onaylayabilirsin.`,
  });

  const { data } = await service.auth.admin.getUserById(studentId);
  const email = data?.user?.email;
  if (email) {
    await sendParentRequestEmail({ to: email, parentName });
  }
}

/** E-posta ile davet edilen öğrenci kayıt olunca bekleyen isteği kendisine bağlar. */
async function claimPendingInvites(studentId: string, email: string) {
  const service = createServiceClient();
  await service
    .from("parent_student_links")
    .update({ student_id: studentId })
    .is("student_id", null)
    .eq("status", "pending")
    .eq("invite_email", email.toLowerCase());
}

async function createTeacherApplication(userId: string, institution: string) {
  const service = createServiceClient();

  const { data: existing } = await service
    .from("teacher_applications")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "pending")
    .maybeSingle();

  if (existing) return;

  await service.from("teacher_applications").insert({
    user_id: userId,
    institution: institution.slice(0, 200),
    status: "pending",
  });

  await service
    .from("profiles")
    .update({ teacher_application_status: "pending" })
    .eq("id", userId);
}

async function createTeacherClassroom(userId: string, name: string) {
  const service = createServiceClient();
  const joinCode = randomBytes(3).toString("hex").toUpperCase();
  await service.from("classrooms").insert({
    teacher_id: userId,
    name,
    join_code: joinCode,
  });
}

export async function requestParentPayment(planId: string, message?: string) {
  const planParsed = z.string().uuid().safeParse(planId);
  if (!planParsed.success) return { ok: false, error: "Paket seçilemedi." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Oturum bulunamadı." };

  const { data: link } = await supabase
    .from("parent_student_links")
    .select("parent_id")
    .eq("student_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("parent_payment_requests").insert({
    student_id: user.id,
    parent_id: link?.parent_id ?? null,
    plan_id: planParsed.data,
    message: message?.slice(0, 500) ?? null,
    status: "pending",
  });

  if (error) return { ok: false, error: "İstek oluşturulamadı." };

  if (link?.parent_id) {
    const service = createServiceClient();
    const studentName = await displayName(user.id);
    await service.from("notifications").insert({
      user_id: link.parent_id,
      title: "Plus ödeme isteği",
      body: `${studentName} bir Plus paketi için ödeme desteği istiyor. Plus sekmesinden inceleyebilirsin.`,
    });
  }

  revalidatePath("/paketler");
  revalidatePath("/veli/plus");
  return { ok: true };
}

const codeSchema = z.string().trim().min(4).max(12);

export async function linkChildByCode(rawCode: string) {
  const parsed = codeSchema.safeParse(rawCode);
  if (!parsed.success) return { ok: false, error: "Kod geçersiz." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Oturum bulunamadı." };

  const result = await createCodeLink(user.id, parsed.data);
  revalidatePath("/veli");
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function inviteChildByEmail(rawEmail: string) {
  const parsed = z.string().email().max(160).safeParse(rawEmail);
  if (!parsed.success) return { ok: false, error: "E-posta geçersiz." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Oturum bulunamadı." };

  const result = await createEmailInvite(user.id, parsed.data);
  revalidatePath("/veli");
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function respondToParentRequest(
  linkId: string,
  accept: boolean,
) {
  const parsed = z.string().uuid().safeParse(linkId);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!parsed.success || !user) return { ok: false };

  const { error } = await supabase
    .from("parent_student_links")
    .update({
      status: accept ? "active" : "revoked",
      accepted_at: accept ? new Date().toISOString() : null,
    })
    .eq("id", parsed.data)
    .eq("student_id", user.id);

  revalidatePath("/profil");
  return { ok: !error };
}
