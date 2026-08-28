import { TeacherShell } from "@/components/layout/teacher-shell";
import { TeacherPlusGate } from "@/components/teacher/plus-gate";
import { AdminTable } from "@/components/admin/admin-table";
import { requireTeacher } from "@/lib/auth/session";
import {
  getTeacherEntitlements,
  incrementTeacherUsage,
  PENDING_TRIAL_REPORTS,
} from "@/lib/teacher/entitlements";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Raporlar" };

export default async function RaporlarPage() {
  const { supabase, user, roles } = await requireTeacher();
  const entitlements = await getTeacherEntitlements(supabase, user.id, roles);
  const service = createServiceClient();

  let locked = false;
  if (entitlements?.isPremium) {
    locked = false;
  } else if (entitlements?.tier === "verified_free") {
    locked = true;
  } else if (entitlements?.tier === "pending") {
    if (entitlements.reportsViewed >= PENDING_TRIAL_REPORTS) {
      locked = true;
    } else {
      await incrementTeacherUsage(service, user.id, "reports_viewed");
    }
  }

  const { data: classrooms } = await supabase
    .from("classrooms")
    .select("id, name, classroom_members(id, student_id)")
    .eq("teacher_id", user.id);

  const classroomIds = (classrooms ?? []).map((classroom) => classroom.id);

  const { data: assignments } = classroomIds.length
    ? await supabase
        .from("assignments")
        .select("id, title, classroom_id, assignment_submissions(id, student_id)")
        .in("classroom_id", classroomIds)
    : { data: [] };

  const classRows = (classrooms ?? []).map((classroom) => {
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

    return [classroom.name, members, classAssignments.length, submissions, `${rate}%`];
  });

  const studentRows =
    entitlements?.isPremium && assignments?.length
      ? (classrooms ?? []).flatMap((classroom) => {
          const members = (classroom.classroom_members ?? []) as {
            student_id: string;
          }[];
          const classAssignments = (assignments ?? []).filter(
            (a) => a.classroom_id === classroom.id,
          );
          return members.map((m) => {
            const submitted = classAssignments.some((a) =>
              (a.assignment_submissions ?? []).some(
                (s) => (s as { student_id: string }).student_id === m.student_id,
              ),
            );
            return [classroom.name, submitted ? "Teslim var" : "Eksik"];
          });
        })
      : [];

  return (
    <TeacherShell title="Raporlar">
      <p className="mb-4 text-sm text-[var(--astra-muted)]">
        Sınıf düzeyinde toplu görünüm. Bireysel AI sohbet içerikleri paylaşılmaz.
      </p>

      {locked ? (
        <TeacherPlusGate
          title="Raporlar Plus ile"
          description={
            entitlements?.tier === "pending"
              ? "Deneme rapor görüntülemen bitti. Plus ile sınıf ve öğrenci kırılımı."
              : "Doğrulanmış ücretsiz hesapta raporlar kapalı. Plus ile açılır."
          }
        />
      ) : (
        <>
          <AdminTable
            columns={["Sınıf", "Öğrenci", "Ödev", "Teslim", "Tamamlanma"]}
            rows={classRows}
            emptyMessage="Rapor için önce sınıf ve ödev oluştur."
          />
          {studentRows.length ? (
            <section className="mt-6">
              <h2 className="mb-2 text-sm font-semibold">Öğrenci özeti (Plus)</h2>
              <AdminTable
                columns={["Sınıf", "Durum"]}
                rows={studentRows}
                emptyMessage=""
              />
            </section>
          ) : null}
        </>
      )}
    </TeacherShell>
  );
}
