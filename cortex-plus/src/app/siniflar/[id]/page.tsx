import Link from "next/link";
import { notFound } from "next/navigation";
import { ClassroomDiscussion } from "@/components/parity/classroom-discussion";
import { ClassroomSharePrep } from "@/components/parity/classroom-share-prep";
import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { requireStudentArea } from "@/lib/auth/session";
import {
  displayName,
  getClassroomAccess,
  initialFromName,
} from "@/lib/student/classroom-access";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Sınıf" };
export const dynamic = "force-dynamic";

export default async function SinifDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);
  const service = createServiceClient();
  const access = await getClassroomAccess(service, id, user.id);

  if (!access.allowed || !access.room) notFound();

  const room = access.room;

  const [{ data: members }, { data: posts }, { data: sharedPreps }, { data: ownPreps }] =
    await Promise.all([
      service
        .from("classroom_members")
        .select("student_id")
        .eq("classroom_id", id),
      service
        .from("classroom_posts")
        .select("id, body, created_at, user_id")
        .eq("classroom_id", id)
        .order("created_at", { ascending: false })
        .limit(40),
      service
        .from("exam_preps")
        .select("id, title, exam_type, user_id")
        .eq("classroom_id", id)
        .order("created_at", { ascending: false }),
      service
        .from("exam_preps")
        .select("id, title")
        .eq("user_id", user.id)
        .is("classroom_id", null)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  const profileIds = [
    ...new Set([
      room.teacher_id,
      ...(members ?? []).map((row) => row.student_id as string),
      ...(posts ?? []).map((row) => row.user_id as string),
    ]),
  ];
  const { data: profiles } = profileIds.length
    ? await service.from("profiles").select("id, full_name").in("id", profileIds)
    : { data: [] as { id: string; full_name: string | null }[] };
  const nameById = new Map(
    (profiles ?? []).map((row) => [row.id, displayName(row.full_name, null)]),
  );

  const people = (members ?? []).map((row) => {
    const name = nameById.get(row.student_id as string) ?? "Üye";
    return {
      id: row.student_id as string,
      name,
      initial: initialFromName(name),
    };
  });

  if (!people.some((p) => p.id === room.teacher_id)) {
    people.unshift({
      id: room.teacher_id,
      name: access.isOwner ? "Sen" : "Kurucu",
      initial: "K",
    });
  }

  return (
    <AstraParitySorShell {...shell}>
      <div className="ap-exam-page ap-class-detail">
        <Link href="/siniflar" className="ap-back-pill">
          ← Geri
        </Link>

        <header className="ap-class-hero">
          <div className="ap-classroom-icon" aria-hidden />
          <div>
            <h1>{room.name}</h1>
            <p className="text-sm text-[var(--ap-muted)]">
              {people.length} üye
              {access.isOwner ? ` · kod ${room.join_code}` : ""}
            </p>
          </div>
        </header>

        <section className="ap-class-section">
          <h2>Üyeler</h2>
          <ul className="ap-class-members">
            {people.map((person) => (
              <li key={person.id} title={person.name}>
                <span className="ap-class-avatar" aria-hidden>
                  {person.initial}
                </span>
                <span>{person.name}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="ap-class-section">
          <h2>Sınav hazırlıkları</h2>
          {(sharedPreps ?? []).length ? (
            <ul className="ap-class-preps">
              {(sharedPreps ?? []).map((prep) => {
                const title = prep.title || prep.exam_type || "Hazırlık";
                const mine = prep.user_id === user.id;
                return (
                  <li key={prep.id} className="ap-classroom-card">
                    <div>
                      <p className="font-semibold">{title}</p>
                      <p className="text-xs text-[var(--ap-muted)]">
                        {mine ? "Senin hazırlığın" : "Sınıf paylaşımı"}
                      </p>
                    </div>
                    {mine ? (
                      <Link
                        href={`/deneme-sinavlari/${prep.id}`}
                        className="ap-chip"
                      >
                        Aç
                      </Link>
                    ) : (
                      <span className="text-xs text-[var(--ap-muted)]">Paylaşıldı</span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-[var(--ap-muted)]">Henüz paylaşılmış hazırlık yok.</p>
          )}
          <ClassroomSharePrep
            classroomId={id}
            preps={(ownPreps ?? []).map((prep) => ({
              id: prep.id,
              title: prep.title || "Hazırlık",
            }))}
          />
        </section>

        <section className="ap-class-section">
          <h2>Tartışma</h2>
          <ClassroomDiscussion classroomId={id} />
          {(posts ?? []).length ? (
            <ul className="ap-class-posts">
              {(posts ?? []).map((post) => {
                const name =
                  post.user_id === user.id
                    ? "Sen"
                    : (nameById.get(post.user_id as string) ?? "Üye");
                const when = new Date(post.created_at as string).toLocaleString("tr-TR", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                });
                return (
                  <li key={post.id} className="ap-class-post">
                    <p className="ap-class-post-meta">
                      {name} · {when}
                    </p>
                    <p>{post.body}</p>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-[var(--ap-muted)]">İlk notu sen bırak.</p>
          )}
        </section>
      </div>
    </AstraParitySorShell>
  );
}
