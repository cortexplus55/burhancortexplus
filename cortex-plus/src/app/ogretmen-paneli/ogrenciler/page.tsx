import { AppShell } from "@/components/layout/app-shell";
import { AdminTable } from "@/components/admin/admin-table";
import { requireTeacher } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Öğrenciler" };

export default async function OgrencilerPage() {
  const { supabase, user } = await requireTeacher();

  const { data: classrooms } = await supabase
    .from("classrooms")
    .select("id, name, classroom_members(joined_at, profiles(full_name, grade_level))")
    .eq("teacher_id", user.id);

  const rows = (classrooms ?? []).flatMap((classroom) =>
    (classroom.classroom_members ?? []).map((member) => [
      (member.profiles as { full_name?: string } | null)?.full_name ?? "İsimsiz",
      (member.profiles as { grade_level?: string } | null)?.grade_level ?? "—",
      classroom.name,
      formatDate(member.joined_at),
    ]),
  );

  return (
    <AppShell variant="admin" title="Öğrenciler">
      <p className="mb-4 text-sm text-muted-foreground">
        Öğrencilerin kişisel AI sohbetleri gizlidir; yalnızca sınıf üyeliği ve ödev
        performansı görüntülenir.
      </p>
      <AdminTable
        columns={["Öğrenci", "Seviye", "Sınıf", "Katılım"]}
        rows={rows}
        emptyMessage="Sınıflarına henüz öğrenci katılmadı."
      />
    </AppShell>
  );
}
