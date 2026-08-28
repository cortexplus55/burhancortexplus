import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  countTeacherStudents,
  getTeacherEntitlements,
} from "@/lib/teacher/entitlements";

const schema = z.object({
  code: z.string().min(4).max(12),
});

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const roles = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .is("revoked_at", null);

  const roleList = (roles.data ?? []).map((r) => r.role as string);
  if (
    !roleList.includes("student") &&
    !roleList.includes("admin")
  ) {
    return NextResponse.json({ error: "student_only" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  const code = parsed.data.code.trim().toUpperCase();
  const service = createServiceClient();

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
    .eq("student_id", user.id)
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
    student_id: user.id,
  });

  if (error) {
    return NextResponse.json({ error: "join_failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    classroomId: classroom.id,
    classroomName: classroom.name,
  });
}
