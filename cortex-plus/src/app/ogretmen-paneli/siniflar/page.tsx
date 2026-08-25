import { AppShell } from "@/components/layout/app-shell";
import { EmptyState, SectionCard } from "@/components/ui-kit/empty-state";
import { ClassroomForm } from "@/components/teacher/classroom-form";
import { Badge } from "@/components/ui/badge";
import { requireTeacher } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Sınıflar" };

export default async function SiniflarPage() {
  const { supabase, user } = await requireTeacher();

  const { data: classrooms } = await supabase
    .from("classrooms")
    .select("id, name, join_code, created_at, classroom_members(id)")
    .eq("teacher_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <AppShell variant="admin" title="Sınıflar">
      <div className="space-y-6">
        <SectionCard
          title="Yeni sınıf"
          description="Sınıf kodunu öğrencilerinle paylaşarak katılmalarını sağlarsın."
        >
          <ClassroomForm />
        </SectionCard>

        {classrooms?.length ? (
          <ul className="divide-y rounded-lg border">
            {classrooms.map((classroom) => (
              <li
                key={classroom.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium">{classroom.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {classroom.classroom_members?.length ?? 0} öğrenci ·{" "}
                    {formatDate(classroom.created_at)}
                  </p>
                </div>
                <Badge variant="secondary">Kod: {classroom.join_code}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            title="Henüz sınıfın yok"
            description="İlk sınıfını oluşturarak öğrencilerini davet et."
          />
        )}
      </div>
    </AppShell>
  );
}
