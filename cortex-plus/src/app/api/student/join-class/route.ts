import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { readJson, withUser } from "@/lib/api/guards";
import {
  countTeacherStudents,
  getTeacherEntitlements,
} from "@/lib/teacher/entitlements";

const schema = z.object({
  code: z.string().min(4).max(12),
});

// A join code is short enough to enumerate, so the per-user ceiling here is the
// thing standing between a logged-in account and every classroom on the site.
export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "join-class", limit: 10 });
  if (!guard.ok) return guard.response;
  const { userId, supabase, service } = guard.ctx;

  const roles = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .is("revoked_at", null);

  const roleList = (roles.data ?? []).map((r) => r.role as string);
  if (
    !roleList.includes("student") &&
    !roleList.includes("admin")
  ) {
    return NextResponse.json({ error: "student_only" }, { status: 403 });
  }

  const parsed = schema.safeParse(await readJson(request));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  const code = parsed.data.code.trim().toUpperCase();

  const { data: classroom } = await service
    .from("classrooms")
    .select("id, teacher_id, name")
    .eq("join_code", code)
    .maybeSingle();

  if (!classroom) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: existing } = await service
    .from("classroom_members")
    .select("id")
    .eq("classroom_id", classroom.id)
    .eq("student_id", userId)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ ok: true, classroomId: classroom.id, already: true });
  }

  const entitlements = await getTeacherEntitlements(
    service,
    classroom.teacher_id,
  );
  const studentCount = await countTeacherStudents(service, classroom.teacher_id);

  if (entitlements && !entitlements.canAddStudent(studentCount)) {
    return NextResponse.json(
      { error: "teacher_student_limit", message: "Öğretmenin öğrenci limiti doldu." },
      { status: 403 },
    );
  }

  const { error } = await supabase.from("classroom_members").insert({
    classroom_id: classroom.id,
    student_id: userId,
  });

  if (error) {
    return NextResponse.json({ error: "join_failed" }, { status: 500 });
  }

  revalidatePath("/siniflar");
  revalidatePath(`/siniflar/${classroom.id}`);
  return NextResponse.json({
    ok: true,
    classroomId: classroom.id,
    classroomName: classroom.name,
  });
}
