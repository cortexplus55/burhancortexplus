import Link from "next/link";
import { notFound } from "next/navigation";
import { TeacherShell } from "@/components/layout/teacher-shell";
import { CopyJoinCode } from "@/components/teacher/copy-join-code";
import { AdminTable } from "@/components/admin/admin-table";
import { requireTeacher } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Sınıf detayı" };

export default async function SinifDetayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user } = await requireTeacher();

  const { data: classroom } = await supabase
    .from("classrooms")
    .select(
      "id, name, join_code, created_at, classroom_members(id, joined_at, profiles(full_name, grade_level)), assignments(id, title, created_at)",
    )
    .eq("id", id)
    .eq("teacher_id", user.id)
    .maybeSingle();

  if (!classroom) notFound();

  const memberRows = (classroom.classroom_members ?? []).map((m) => [
    (m.profiles as { full_name?: string } | null)?.full_name ?? "İsimsiz",
    (m.profiles as { grade_level?: string } | null)?.grade_level ?? "—",
    formatDate(m.joined_at),
  ]);

  return (
    <TeacherShell title={classroom.name}>
      <div className="space-y-6">
        <div className="astra-pay-card space-y-2 p-4">
          <p className="text-sm text-[var(--astra-muted)]">Katılım kodu</p>
          <CopyJoinCode code={classroom.join_code} />
          <p className="text-xs text-[var(--astra-muted)]">
            Oluşturulma: {formatDate(classroom.created_at)}
          </p>
        </div>

        <section>
          <h2 className="mb-2 text-sm font-semibold">Öğrenciler</h2>
          <AdminTable
            columns={["Öğrenci", "Seviye", "Katılım"]}
            rows={memberRows}
            emptyMessage="Henüz öğrenci yok — kodu paylaş."
          />
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Ödevler</h2>
            <Link
              href="/ogretmen-paneli/odevler"
              className="text-xs text-[var(--astra-primary)] underline"
            >
              Tüm ödevler
            </Link>
          </div>
          {(classroom.assignments ?? []).length ? (
            <ul className="divide-y rounded-xl border border-[var(--astra-border)] text-sm">
              {(classroom.assignments ?? []).map((a) => (
                <li key={a.id} className="px-3 py-2">
                  <Link
                    href={`/ogretmen-paneli/odevler/${a.id}`}
                    className="font-medium hover:underline"
                  >
                    {a.title}
                  </Link>
                  <span className="ml-2 text-xs text-[var(--astra-muted)]">
                    {formatDate(a.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--astra-muted)]">Bu sınıfta henüz ödev yok.</p>
          )}
        </section>

        <Link
          href="/ogretmen-paneli/siniflar"
          className="text-sm text-[var(--astra-muted)] underline"
        >
          ← Sınıflar
        </Link>
      </div>
    </TeacherShell>
  );
}
