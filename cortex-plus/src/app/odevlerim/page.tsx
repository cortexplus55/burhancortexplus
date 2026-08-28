import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { requireStudentArea } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Ödevlerim" };

export default async function OdevlerimPage() {
  const { supabase, user } = await requireStudentArea();

  const { data: members } = await supabase
    .from("classroom_members")
    .select("classroom_id")
    .eq("student_id", user.id);

  const classroomIds = (members ?? []).map((m) => m.classroom_id);

  const { data: assignments } = classroomIds.length
    ? await supabase
        .from("assignments")
        .select(
          "id, title, due_at, created_at, quiz_id, classroom_id, classrooms(name), assignment_submissions(id, submitted_at)",
        )
        .in("classroom_id", classroomIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  return (
    <AppShell title="Ödevlerim">
      {!assignments?.length ? (
        <p className="text-sm text-[var(--astra-muted)]">
          Henüz ödev yok.{" "}
          <Link href="/sinifim" className="underline">
            Sınıfa katıl
          </Link>
        </p>
      ) : (
        <ul className="divide-y rounded-xl border border-[var(--astra-border)]">
          {assignments.map((a) => {
            const submission = (
              a.assignment_submissions as { id: string; submitted_at: string | null }[] | null
            )?.[0];
            const classroom = a.classrooms as unknown as { name: string } | null;
            return (
              <li key={a.id} className="px-4 py-3 text-sm">
                <Link href={`/odevlerim/${a.id}`} className="font-medium hover:underline">
                  {a.title}
                </Link>
                <p className="text-xs text-[var(--astra-muted)]">
                  {classroom?.name ?? "Sınıf"} ·{" "}
                  {a.due_at ? `Teslim ${formatDate(a.due_at)}` : "Süresiz"} ·{" "}
                  {submission?.submitted_at ? "Teslim edildi" : "Bekliyor"}
                  {a.quiz_id ? " · Quiz" : ""}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}
