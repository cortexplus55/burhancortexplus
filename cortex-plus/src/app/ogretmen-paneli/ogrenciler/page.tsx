import { TeacherShell } from "@/components/layout/teacher-shell";
import { RemoveMemberButton } from "@/components/teacher/remove-member-button";
import { AdminTable } from "@/components/admin/admin-table";
import { requireTeacher } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Öğrenciler" };

export default async function OgrencilerPage({
  searchParams,
}: {
  searchParams: Promise<{ sinif?: string }>;
}) {
  const { sinif: classFilter } = await searchParams;
  const { supabase, user } = await requireTeacher();

  const { data: classrooms } = await supabase
    .from("classrooms")
    .select(
      "id, name, classroom_members(id, classroom_id, joined_at, profiles(full_name, grade_level))",
    )
    .eq("teacher_id", user.id);

  const filtered = classFilter
    ? (classrooms ?? []).filter((c) => c.id === classFilter)
    : (classrooms ?? []);

  type Row = {
    name: string;
    grade: string;
    className: string;
    joined: string;
    memberId: string;
    classroomId: string;
  };

  const rows: Row[] = filtered.flatMap((classroom) =>
    (classroom.classroom_members ?? []).map((member) => ({
      name:
        (member.profiles as { full_name?: string } | null)?.full_name ?? "İsimsiz",
      grade:
        (member.profiles as { grade_level?: string } | null)?.grade_level ?? "—",
      className: classroom.name,
      joined: formatDate(member.joined_at),
      memberId: member.id as string,
      classroomId: classroom.id,
    })),
  );

  return (
    <TeacherShell title="Öğrenciler">
      <p className="mb-4 text-sm text-[var(--astra-muted)]">
        Kişisel AI sohbetleri gizlidir; yalnızca sınıf üyeliği ve ödev performansı
        görüntülenir.
      </p>

      {classrooms?.length ? (
        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          <a
            href="/ogretmen-paneli/ogrenciler"
            className={`rounded-full px-3 py-1 ${!classFilter ? "bg-[var(--astra-primary)] text-white" : "border border-[var(--astra-border)]"}`}
          >
            Tümü
          </a>
          {classrooms.map((c) => (
            <a
              key={c.id}
              href={`/ogretmen-paneli/ogrenciler?sinif=${c.id}`}
              className={`rounded-full px-3 py-1 ${classFilter === c.id ? "bg-[var(--astra-primary)] text-white" : "border border-[var(--astra-border)]"}`}
            >
              {c.name}
            </a>
          ))}
        </div>
      ) : null}

      {rows.length ? (
        <ul className="divide-y rounded-xl border border-[var(--astra-border)]">
          {rows.map((row) => (
            <li
              key={row.memberId}
              className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-sm"
            >
              <div>
                <p className="font-medium">{row.name}</p>
                <p className="text-xs text-[var(--astra-muted)]">
                  {row.grade} · {row.className} · {row.joined}
                </p>
              </div>
              <RemoveMemberButton
                memberId={row.memberId}
                classroomId={row.classroomId}
              />
            </li>
          ))}
        </ul>
      ) : (
        <AdminTable
          columns={["Öğrenci", "Seviye", "Sınıf", "Katılım"]}
          rows={[]}
          emptyMessage="Sınıflarına henüz öğrenci katılmadı."
        />
      )}
    </TeacherShell>
  );
}
