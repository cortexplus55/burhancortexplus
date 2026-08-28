"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export async function submitAssignment(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Oturum gerekli." };

  const parsed = z
    .object({
      assignmentId: z.string().uuid(),
      content: z.string().min(1).max(8000),
    })
    .safeParse({
      assignmentId: formData.get("assignmentId"),
      content: formData.get("content"),
    });

  if (!parsed.success) return { ok: false, error: "Geçersiz teslim." };

  const { data: assignment } = await supabase
    .from("assignments")
    .select("id, classroom_id")
    .eq("id", parsed.data.assignmentId)
    .maybeSingle();

  if (!assignment) return { ok: false, error: "Ödev bulunamadı." };

  const { data: member } = await supabase
    .from("classroom_members")
    .select("id")
    .eq("classroom_id", assignment.classroom_id)
    .eq("student_id", user.id)
    .maybeSingle();

  if (!member) return { ok: false, error: "Bu sınıfa üye değilsin." };

  const { error } = await supabase.from("assignment_submissions").upsert(
    {
      assignment_id: parsed.data.assignmentId,
      student_id: user.id,
      content: parsed.data.content,
      submitted_at: new Date().toISOString(),
    },
    { onConflict: "assignment_id,student_id" },
  );

  revalidatePath("/odevlerim");
  revalidatePath(`/odevlerim/${parsed.data.assignmentId}`);
  return { ok: !error, error: error ? "Kaydedilemedi." : undefined };
}
