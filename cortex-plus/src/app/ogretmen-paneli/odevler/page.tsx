import { AppShell } from "@/components/layout/app-shell";
import { EmptyState, SectionCard } from "@/components/ui-kit/empty-state";
import { AssignmentForm } from "@/components/teacher/assignment-form";
import { requireTeacher } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Ödevler" };

export default async function OdevlerPage() {
  const { supabase, user } = await requireTeacher();

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

  return (
    <AppShell variant="admin" title="Ödevler">
      <div className="space-y-6">
        {classrooms?.length ? (
          <SectionCard title="Yeni ödev">
            <AssignmentForm classrooms={classrooms} />
          </SectionCard>
        ) : (
          <EmptyState
            title="Önce bir sınıf oluştur"
            description="Ödev verebilmek için en az bir sınıfın olmalı."
            actionHref="/ogretmen-paneli/siniflar"
            actionLabel="Sınıf oluştur"
          />
        )}

        {assignments?.length ? (
          <ul className="divide-y rounded-lg border">
            {assignments.map((assignment) => (
              <li
                key={assignment.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-medium">{assignment.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {classroomNames.get(assignment.classroom_id) ?? "Sınıf"} ·{" "}
                    {assignment.due_at
                      ? `Teslim ${formatDate(assignment.due_at)}`
                      : "Süresiz"}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {assignment.assignment_submissions?.length ?? 0} teslim
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </AppShell>
  );
}
