import Link from "next/link";
import { TeacherShell } from "@/components/layout/teacher-shell";
import { CopyJoinCode } from "@/components/teacher/copy-join-code";
import { TeacherPlusGate } from "@/components/teacher/plus-gate";
import { ClassroomForm } from "@/components/teacher/classroom-form";
import { EmptyState, SectionCard } from "@/components/ui-kit/empty-state";
import { requireTeacher } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { getTeacherEntitlements } from "@/lib/teacher/entitlements";

export const metadata = { title: "Sınıflar" };

export default async function SiniflarPage() {
  const { supabase, user, roles } = await requireTeacher();
  const entitlements = await getTeacherEntitlements(supabase, user.id, roles);

  const { data: classrooms } = await supabase
    .from("classrooms")
    .select("id, name, join_code, created_at, classroom_members(id)")
    .eq("teacher_id", user.id)
    .order("created_at", { ascending: false });

  const canAdd =
    entitlements?.canCreateClassroom(classrooms?.length ?? 0) ?? false;

  return (
    <TeacherShell title="Sınıflar">
      <div className="space-y-6">
        {canAdd ? (
          <SectionCard
            title="Yeni sınıf"
            description="Sınıf kodunu öğrencilerinle paylaşarak katılmalarını sağlarsın."
          >
            <ClassroomForm />
          </SectionCard>
        ) : (
          <TeacherPlusGate
            title="Sınıf limitine ulaştın"
            description="Ücretsiz planda 1 sınıf açabilirsin. Plus ile sınırsız sınıf oluştur."
          />
        )}

        {classrooms?.length ? (
          <ul className="divide-y rounded-xl border border-[var(--astra-border)]">
            {classrooms.map((classroom) => (
              <li
                key={classroom.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div>
                  <Link
                    href={`/ogretmen-paneli/siniflar/${classroom.id}`}
                    className="text-sm font-medium hover:underline"
                  >
                    {classroom.name}
                  </Link>
                  <p className="text-xs text-[var(--astra-muted)]">
                    {classroom.classroom_members?.length ?? 0} öğrenci ·{" "}
                    {formatDate(classroom.created_at)}
                  </p>
                </div>
                <CopyJoinCode code={classroom.join_code} />
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
    </TeacherShell>
  );
}
