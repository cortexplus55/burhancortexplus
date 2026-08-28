import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { AssignmentSubmitForm } from "@/components/student/assignment-submit-form";
import { requireStudentArea } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Ödev" };

export default async function OdevDetayStudentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user } = await requireStudentArea();

  const { data: assignment } = await supabase
    .from("assignments")
    .select(
      "id, title, description, due_at, quiz_id, classroom_id, classrooms(name)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!assignment) notFound();

  const { data: member } = await supabase
    .from("classroom_members")
    .select("id")
    .eq("classroom_id", assignment.classroom_id)
    .eq("student_id", user.id)
    .maybeSingle();

  if (!member) notFound();

  const { data: submission } = await supabase
    .from("assignment_submissions")
    .select("content, submitted_at")
    .eq("assignment_id", id)
    .eq("student_id", user.id)
    .maybeSingle();

  const classroom = assignment.classrooms as unknown as { name: string } | null;

  return (
    <AppShell title={assignment.title}>
      <div className="space-y-6">
        <div className="astra-pay-card space-y-2 p-4 text-sm">
          <p className="text-[var(--astra-muted)]">{classroom?.name}</p>
          {assignment.description ? <p>{assignment.description}</p> : null}
          {assignment.due_at ? (
            <p className="text-xs text-[var(--astra-muted)]">
              Teslim: {formatDate(assignment.due_at)}
            </p>
          ) : null}
        </div>

        {assignment.quiz_id ? (
          <Link
            href={`/quizler?quiz=${assignment.quiz_id}`}
            className="astra-btn-primary inline-flex rounded-full px-5 py-2 text-sm font-semibold"
          >
            Quiz ödevini çöz
          </Link>
        ) : (
          <AssignmentSubmitForm
            assignmentId={assignment.id}
            defaultContent={submission?.content ?? undefined}
          />
        )}

        {submission?.submitted_at ? (
          <p className="text-xs text-[var(--astra-muted)]">
            Son teslim: {formatDate(submission.submitted_at)}
          </p>
        ) : null}

        <Link href="/odevlerim" className="text-sm underline">
          ← Ödevlerim
        </Link>
      </div>
    </AppShell>
  );
}
