import Link from "next/link";
import { notFound } from "next/navigation";
import { TeacherShell } from "@/components/layout/teacher-shell";
import { AdminTable } from "@/components/admin/admin-table";
import { requireTeacher } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Ödev detayı" };

export default async function OdevDetayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user } = await requireTeacher();

  const { data: assignment } = await supabase
    .from("assignments")
    .select(
      "id, title, description, due_at, created_at, quiz_id, classroom_id, classrooms!inner(name, teacher_id), assignment_submissions(id, content, submitted_at, profiles(full_name))",
    )
    .eq("id", id)
    .eq("classrooms.teacher_id", user.id)
    .maybeSingle();

  if (!assignment) notFound();

  const classroom = assignment.classrooms as unknown as { name: string };
  const submissions = (assignment.assignment_submissions ?? []) as {
    id: string;
    content: string | null;
    submitted_at: string | null;
    profiles: { full_name?: string } | null;
  }[];

  const rows = submissions.map((s) => [
    s.profiles?.full_name ?? "Öğrenci",
    s.submitted_at ? formatDate(s.submitted_at) : "—",
    s.content ? s.content.slice(0, 80) : "—",
  ]);

  return (
    <TeacherShell title={assignment.title}>
      <div className="space-y-6">
        <div className="astra-pay-card space-y-2 p-4 text-sm">
          <p className="text-[var(--astra-muted)]">{classroom.name}</p>
          {assignment.description ? <p>{assignment.description}</p> : null}
          {assignment.due_at ? (
            <p className="text-xs text-[var(--astra-muted)]">
              Teslim: {formatDate(assignment.due_at)}
            </p>
          ) : null}
          {assignment.quiz_id ? (
            <p className="text-xs text-[var(--astra-primary)]">Quiz bağlı ödev</p>
          ) : null}
        </div>

        <section>
          <h2 className="mb-2 text-sm font-semibold">Teslimler</h2>
          <AdminTable
            columns={["Öğrenci", "Tarih", "Özet"]}
            rows={rows}
            emptyMessage="Henüz teslim yok."
          />
        </section>

        <Link
          href="/ogretmen-paneli/odevler"
          className="text-sm text-[var(--astra-muted)] underline"
        >
          ← Ödevler
        </Link>
      </div>
    </TeacherShell>
  );
}
