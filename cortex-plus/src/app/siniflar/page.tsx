import Link from "next/link";
import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { CreateClassForm } from "@/components/student/create-class-form";
import { JoinClassForm } from "@/components/student/join-class-form";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Sınıflar" };
export const dynamic = "force-dynamic";

export default async function SiniflarPage() {
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
    <AstraParitySorShell {...shell}>
      <div className="ap-exam-page space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Sınıflar</h1>
          <p className="mt-1 text-sm text-[var(--astra-muted)]">
            Kendi çalışma grubunu oluştur veya öğretmen koduyla katıl.
          </p>
        </div>

        {hasAny ? (
          <ul className="space-y-3">
            {(owned ?? []).map((room) => (
              <li key={room.id}>
                <Link href={`/siniflar/${room.id}`} className="ap-classroom-card">
                  <div className="ap-classroom-icon" aria-hidden />
                  <div>
                    <p className="font-semibold">{room.name}</p>
                    <p className="text-xs text-[var(--ap-muted)]">Senin grubun · kod {room.join_code}</p>
                  </div>
                  <span className="ap-classroom-chevron" aria-hidden>›</span>
                </Link>
              </li>
            ))}
            {joined.map((room) => (
              <li key={room.id}>
                <Link href={`/siniflar/${room.id}`} className="ap-classroom-card">
                  <div className="ap-classroom-icon ap-classroom-icon--joined" aria-hidden />
                  <div>
                    <p className="font-semibold">{room.name}</p>
                    <p className="text-xs text-[var(--ap-muted)]">Katıldığın sınıf</p>
                  </div>
                  <div className="ap-classroom-side">
                    <p className="text-xs text-[var(--ap-muted)]">Sınav hazırlıkları</p>
                    <p className="text-sm">Detay</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="ap-class-empty">
            <h1>İlk sınıfına katıl veya oluştur</h1>
            <p>
              Öğretmeninin verdiği kodla gir; ya da arkadaşlarınla çalışmak için
              kendi grubunu aç.
            </p>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <JoinClassForm />
          <CreateClassForm />
        </div>
      </div>
    </AstraParitySorShell>
  );
}
