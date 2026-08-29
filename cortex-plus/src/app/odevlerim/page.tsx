import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/ui-kit/empty-state";
import { requireStudentArea } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

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
        <EmptyState
          variant="astra"
          icon={ClipboardList}
          title="Henüz ödevin yok"
          description="Öğretmenin ödev verdiğinde burada görünür. Sınıfa katılmadıysan kodu gir."
          actionHref="/sinifim"
          actionLabel="Sınıfa katıl"
        />
      ) : (
        <ul className="space-y-2">
          {assignments.map((a) => {
            const submission = (
              a.assignment_submissions as { id: string; submitted_at: string | null }[] | null
            )?.[0];
            const classroom = a.classrooms as unknown as { name: string } | null;
            const submitted = Boolean(submission?.submitted_at);
            return (
              <li key={a.id}>
                <Link
                  href={`/odevlerim/${a.id}`}
                  className="astra-pay-card block px-4 py-3 transition-colors hover:bg-[var(--astra-pill)]"
                >
                  <p className="text-sm font-medium text-[var(--astra-text)]">{a.title}</p>
                  <p className="mt-1 text-xs text-[var(--astra-muted)]">
                    {classroom?.name ?? "Sınıf"} ·{" "}
                    {a.due_at ? `Teslim ${formatDate(a.due_at)}` : "Süresiz"}
                    {a.quiz_id ? " · Quiz" : ""}
                  </p>
                  <span
                    className={cn(
                      "mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                      submitted
                        ? "bg-amber-500/20 text-amber-200"
                        : "bg-white/10 text-[var(--astra-muted)]",
                    )}
                  >
                    {submitted ? "Teslim edildi" : "Bekliyor"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}
