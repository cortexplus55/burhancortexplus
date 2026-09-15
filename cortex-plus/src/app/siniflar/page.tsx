import Link from "next/link";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { CreateClassForm } from "@/components/student/create-class-form";
import { JoinClassForm } from "@/components/student/join-class-form";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Sınıflar" };
export const dynamic = "force-dynamic";

/** Davet bağlantısındaki kod: /siniflar?kod=ABC123 */
function codeFromQuery(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  // Sunucudan geliyor ama yine de istemci girdisi; forma ham hâliyle
  // koymuyoruz.
  return (raw ?? "").trim().slice(0, 12).toUpperCase();
}

export default async function SiniflarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const initialCode = codeFromQuery((await searchParams).kod);
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);
  const service = createServiceClient();

  const [{ data: owned }, { data: memberships }] = await Promise.all([
    service
      .from("classrooms")
      .select("id, name, join_code, created_at")
      .eq("teacher_id", user.id)
      .order("created_at", { ascending: false }),
    service
      .from("classroom_members")
      .select("id, classrooms(id, name, join_code, teacher_id)")
      .eq("student_id", user.id),
  ]);

  const ownedIds = new Set((owned ?? []).map((row) => row.id));
  const joined = (memberships ?? [])
    .flatMap((row) => {
      const room = row.classrooms as
        | { id: string; name: string; join_code: string; teacher_id: string }
        | { id: string; name: string; join_code: string; teacher_id: string }[]
        | null;
      if (!room) return [];
      return Array.isArray(room) ? room : [room];
    })
    .filter((room) => !ownedIds.has(room.id));

  const hasAny = (owned?.length ?? 0) > 0 || joined.length > 0;

  return (
    <ParitySorShell {...shell}>
      <div className="cp-exam-page space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Sınıflar</h1>
          <p className="mt-1 text-sm text-[var(--cs-muted)]">
            Kendi çalışma grubunu oluştur veya öğretmen koduyla katıl.
          </p>
        </div>

        {hasAny ? (
          <ul className="space-y-3">
            {(owned ?? []).map((room) => (
              <li key={room.id}>
                <Link href={`/siniflar/${room.id}`} className="cp-classroom-card">
                  <div className="cp-classroom-icon" aria-hidden />
                  <div>
                    <p className="font-semibold">{room.name}</p>
                    <p className="text-xs text-[var(--cp-muted)]">Senin grubun · kod {room.join_code}</p>
                  </div>
                  <span className="cp-classroom-chevron" aria-hidden>›</span>
                </Link>
              </li>
            ))}
            {joined.map((room) => (
              <li key={room.id}>
                <Link href={`/siniflar/${room.id}`} className="cp-classroom-card">
                  <div className="cp-classroom-icon cp-classroom-icon--joined" aria-hidden />
                  <div>
                    <p className="font-semibold">{room.name}</p>
                    <p className="text-xs text-[var(--cp-muted)]">Katıldığın sınıf</p>
                  </div>
                  <div className="cp-classroom-side">
                    <p className="text-xs text-[var(--cp-muted)]">Sınav hazırlıkları</p>
                    <p className="text-sm">Detay</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="cp-class-empty">
            <h1>İlk sınıfına katıl veya oluştur</h1>
            <p>
              Öğretmeninin verdiği kodla gir; ya da arkadaşlarınla çalışmak için
              kendi grubunu aç.
            </p>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <JoinClassForm initialCode={initialCode} />
          <CreateClassForm />
        </div>
      </div>
    </ParitySorShell>
  );
}
