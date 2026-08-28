import Link from "next/link";
import { TeacherShell } from "@/components/layout/teacher-shell";
import { CopyJoinCode } from "@/components/teacher/copy-join-code";
import { TeacherPlusGate } from "@/components/teacher/plus-gate";
import { requireTeacher } from "@/lib/auth/session";
import { formatNumber } from "@/lib/format";
import {
  FREE_MAX_CLASSROOMS,
  FREE_MAX_STUDENTS,
  getTeacherEntitlements,
} from "@/lib/teacher/entitlements";

export const metadata = { title: "Öğretmen paneli" };

export default async function OgretmenPaneliPage() {
  const { supabase, user, roles } = await requireTeacher();
  const entitlements = await getTeacherEntitlements(supabase, user.id, roles);

  const { data: classrooms } = await supabase
    .from("classrooms")
    .select("id, name, join_code, created_at, classroom_members(id)")
    .eq("teacher_id", user.id)
    .order("created_at", { ascending: false });

  const classCount = classrooms?.length ?? 0;
  const studentCount = (classrooms ?? []).reduce(
    (sum, classroom) => sum + (classroom.classroom_members?.length ?? 0),
    0,
  );

  const classroomIds = (classrooms ?? []).map((c) => c.id);
  const { data: recentAssignments } = classroomIds.length
    ? await supabase
        .from("assignments")
        .select("id, title, created_at, assignment_submissions(id)")
        .in("classroom_id", classroomIds)
        .order("created_at", { ascending: false })
        .limit(5)
    : { data: [] };

  const firstClass = classrooms?.[0];

  return (
    <TeacherShell title="Özet">
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="astra-pay-card p-4">
            <p className="text-xs text-[var(--astra-muted)]">Sınıf</p>
            <p className="mt-1 text-2xl font-semibold">{formatNumber(classCount)}</p>
            {entitlements && !entitlements.isPremium ? (
              <p className="mt-1 text-xs text-[var(--astra-muted)]">
                Limit: {classCount}/{FREE_MAX_CLASSROOMS}
              </p>
            ) : null}
          </div>
          <div className="astra-pay-card p-4">
            <p className="text-xs text-[var(--astra-muted)]">Öğrenci</p>
            <p className="mt-1 text-2xl font-semibold">{formatNumber(studentCount)}</p>
            {entitlements && !entitlements.isPremium ? (
              <p className="mt-1 text-xs text-[var(--astra-muted)]">
                Limit: {studentCount}/{FREE_MAX_STUDENTS}
              </p>
            ) : null}
          </div>
        </div>

        {firstClass ? (
          <section className="astra-pay-card space-y-3 p-4">
            <h2 className="text-sm font-semibold">{firstClass.name}</h2>
            <p className="text-xs text-[var(--astra-muted)]">
              Öğrencilerin bu kodla sınıfa katılır.
            </p>
            <CopyJoinCode code={firstClass.join_code} />
            <Link
              href={`/ogretmen-paneli/siniflar/${firstClass.id}`}
              className="text-xs font-medium text-[var(--astra-primary)] underline"
            >
              Sınıf detayı
            </Link>
          </section>
        ) : (
          <section className="astra-pay-card p-4 text-sm text-[var(--astra-muted)]">
            Henüz sınıf yok.{" "}
            <Link href="/ogretmen-paneli/siniflar" className="text-[var(--astra-primary)] underline">
              İlk sınıfını oluştur
            </Link>
          </section>
        )}

        {!entitlements?.isPremium && classCount >= FREE_MAX_CLASSROOMS ? (
          <TeacherPlusGate
            title="İkinci sınıf Plus ile"
            description="Ücretsiz planda 1 sınıf açabilirsin. Sınırsız sınıf ve 30+ öğrenci için Plus."
          />
        ) : null}

        <p className="text-xs text-[var(--astra-muted)]">
          Öğrencilerin AI öğretmen sohbetleri gizlidir; panelde görüntülenmez.
        </p>

        {entitlements?.isPremium && recentAssignments?.length ? (
          <section>
            <h2 className="mb-2 text-sm font-semibold">Son ödevler</h2>
            <ul className="divide-y rounded-xl border border-[var(--astra-border)]">
              {recentAssignments.map((a) => (
                <li key={a.id} className="flex justify-between gap-2 px-3 py-2 text-sm">
                  <Link
                    href={`/ogretmen-paneli/odevler/${a.id}`}
                    className="font-medium hover:underline"
                  >
                    {a.title}
                  </Link>
                  <span className="text-xs text-[var(--astra-muted)]">
                    {a.assignment_submissions?.length ?? 0} teslim
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <nav className="grid gap-2 sm:grid-cols-2">
          {[
            { href: "/ogretmen-paneli/ogrenciler", label: "Öğrenciler" },
            { href: "/ogretmen-paneli/quizler", label: "Quizler" },
            { href: "/ogretmen-paneli/raporlar", label: "Raporlar" },
            { href: "/ogretmen-paneli/plus", label: "Plus" },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="astra-pay-card px-4 py-3 text-sm font-medium hover:border-[var(--astra-primary)]"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </TeacherShell>
  );
}
