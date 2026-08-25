import { AppShell } from "@/components/layout/app-shell";
import { AdminTable } from "@/components/admin/admin-table";
import { requireTeacher } from "@/lib/auth/session";

export const metadata = { title: "Raporlar" };

export default async function RaporlarPage() {
  const { supabase, user } = await requireTeacher();

  const { data: classrooms } = await supabase
    .from("classrooms")
    .select("id, name, classroom_members(id)")
    .eq("teacher_id", user.id);

  const classroomIds = (classrooms ?? []).map((classroom) => classroom.id);

  const { data: assignments } = classroomIds.length
    ? await supabase
        .from("assignments")
        .select("id, classroom_id, assignment_submissions(id)")
        .in("classroom_id", classroomIds)
    : { data: [] };

  const rows = (classrooms ?? []).map((classroom) => {
    const classAssignments = (assignments ?? []).filter(
      (assignment) => assignment.classroom_id === classroom.id,
    );
    const submissions = classAssignments.reduce(
      (sum, assignment) => sum + (assignment.assignment_submissions?.length ?? 0),
      0,
    );
    const members = classroom.classroom_members?.length ?? 0;
    const expected = classAssignments.length * members;
    const rate = expected ? Math.round((submissions / expected) * 100) : 0;

    return [
      classroom.name,
      members,
      classAssignments.length,
      submissions,
      `${rate}%`,
    ];
  });

  return (
    <AppShell variant="admin" title="Raporlar">
      <p className="mb-4 text-sm text-muted-foreground">
        Sınıf düzeyinde toplu görünüm. Bireysel AI sohbet içerikleri paylaşılmaz.
      </p>
      <AdminTable
        columns={["Sınıf", "Öğrenci", "Ödev", "Teslim", "Tamamlanma"]}
        rows={rows}
        emptyMessage="Rapor için önce sınıf ve ödev oluştur."
      />
    </AppShell>
  );
}
