import Link from "next/link";
import { TeacherShell } from "@/components/layout/teacher-shell";
import { AssignmentForm } from "@/components/teacher/assignment-form";
import { EmptyState, SectionCard } from "@/components/ui-kit/empty-state";
import { AdminTable } from "@/components/admin/admin-table";
import { requireTeacher } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { getTeacherEntitlements } from "@/lib/teacher/entitlements";

export const metadata = { title: "Ödevler" };

export default async function OdevlerPage() {
  const { supabase, user, roles } = await requireTeacher();
  const entitlements = await getTeacherEntitlements(supabase, user.id, roles);

  const { data: classrooms } = await supabase
    .from("classrooms")
    .select("id, name")
    .eq("teacher_id", user.id)
    .order("created_at", { ascending: false });

  const classroomIds = (classrooms ?? []).map((classroom) => classroom.id);

  const { data: assignments } = classroomIds.length
    ? await supabase
        .from("assignments")
        .select("id, title, due_at, created_at, classroom_id, assignment_submissions(id)")
        .in("classroom_id", classroomIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  const classroomNames = new Map(
    (classrooms ?? []).map((classroom) => [classroom.id, classroom.name]),
  );

  const canCreate = entitlements?.canCreateAssignment() ?? false;

  const { data: teacherQuizzes } =
    entitlements?.canAttachQuizToAssignment()
      ? await supabase
          .from("quizzes")
          .select("id, title")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(20)
      : { data: [] };

  return (
    <TeacherShell title="Ödevler">
      <div className="space-y-6">
        {classrooms?.length ? (
          canCreate ? (
            <SectionCard variant="astra" title="Yeni ödev">
              <AssignmentForm
                classrooms={classrooms}
                allowQuizAttach={entitlements?.canAttachQuizToAssignment() ?? false}
                quizzes={teacherQuizzes ?? []}
              />
            </SectionCard>
          ) : (
            <EmptyState
              variant="astra"
              title="Deneme ödev hakkın doldu"
              description="Doğrulama sonrası sınırsız temel ödev verebilirsin. Plus ile quiz bağlayabilirsin."
              actionHref="/ogretmen-paneli/plus"
              actionLabel="Plus"
            />
          )
        ) : (
          <EmptyState
            variant="astra"
            title="Önce bir sınıf oluştur"
            description="Ödev verebilmek için en az bir sınıfın olmalı."
            actionHref="/ogretmen-paneli/siniflar"
            actionLabel="Sınıf oluştur"
          />
        )}

        {assignments?.length ? (
          <ul className="space-y-2">
            {assignments.map((assignment) => (
              <li key={assignment.id}>
                <Link
                  href={`/ogretmen-paneli/odevler/${assignment.id}`}
                  className="astra-pay-card flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-[var(--astra-pill)]"
                >
                  <div>
                    <p className="font-medium text-[var(--astra-text)]">{assignment.title}</p>
                    <p className="text-xs text-[var(--astra-muted)]">
                      {classroomNames.get(assignment.classroom_id) ?? "Sınıf"} ·{" "}
                      {assignment.due_at
                        ? `Teslim ${formatDate(assignment.due_at)}`
                        : "Süresiz"}
                    </p>
                  </div>
                  <span className="text-xs text-[var(--astra-muted)]">
                    {assignment.assignment_submissions?.length ?? 0} teslim
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <AdminTable
            columns={["Ödev"]}
            rows={[]}
            emptyMessage="Henüz ödev oluşturmadın."
          />
        )}
      </div>
    </TeacherShell>
  );
}
