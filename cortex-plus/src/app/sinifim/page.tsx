import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { JoinClassForm } from "@/components/student/join-class-form";
import { requireStudentArea } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Sınıfım" };

export default async function SinifimPage() {
  const { supabase, user } = await requireStudentArea();

  const { data: memberships } = await supabase
    .from("classroom_members")
    .select(
      "joined_at, classrooms(id, name, join_code, teacher_id, profiles:teacher_id(full_name))",
    )
    .eq("student_id", user.id)
    .order("joined_at", { ascending: false });

  return (
    <AppShell title="Sınıfım">
      <div className="space-y-6">
        <JoinClassForm />

        {memberships?.length ? (
          <ul className="divide-y rounded-xl border border-[var(--astra-border)]">
            {memberships.map((m) => {
              const classroom = m.classrooms as unknown as {
                id: string;
                name: string;
                profiles: { full_name?: string } | null;
              } | null;
              return (
                <li key={classroom?.id ?? m.joined_at} className="px-4 py-3 text-sm">
                  <p className="font-medium">{classroom?.name ?? "Sınıf"}</p>
                  <p className="text-xs text-[var(--astra-muted)]">
                    Öğretmen:{" "}
                    {classroom?.profiles?.full_name ?? "—"} · Katılım:{" "}
                    {formatDate(m.joined_at)}
                  </p>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-[var(--astra-muted)]">
            Henüz bir sınıfa katılmadın. Öğretmeninden katılım kodunu iste.
          </p>
        )}

        <Link href="/odevlerim" className="text-sm text-[var(--astra-primary)] underline">
          Ödevlerim →
        </Link>
      </div>
    </AppShell>
  );
}
