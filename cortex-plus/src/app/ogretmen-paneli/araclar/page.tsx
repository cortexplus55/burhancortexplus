import { TeacherShell } from "@/components/layout/teacher-shell";
import { TeacherAiHub } from "@/components/teacher/teacher-ai-hub";
import { astraGreetingName } from "@/components/parity/astra-app-utils";
import { requireTeacher } from "@/lib/auth/session";

export const metadata = { title: "Öğretmen araçları" };

export default async function OgretmenAraclariPage() {
  const { supabase, user } = await requireTeacher();

  const [{ data: profile }, { data: classrooms }] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("classrooms")
      .select("id, classroom_members(id)")
      .eq("teacher_id", user.id),
  ]);

  const classCount = classrooms?.length ?? 0;
  const studentCount = (classrooms ?? []).reduce(
    (sum, c) => sum + (c.classroom_members?.length ?? 0),
    0,
  );

  const greetingName = astraGreetingName(profile?.full_name ?? user.email);

  return (
    <TeacherShell title="Öğretmen">
      <TeacherAiHub
        greetingName={greetingName}
        classCount={classCount}
        studentCount={studentCount}
      />
    </TeacherShell>
  );
}
