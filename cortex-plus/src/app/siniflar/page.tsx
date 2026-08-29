import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { JoinClassForm } from "@/components/student/join-class-form";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";

export const metadata = { title: "Sınıflar" };

export default async function SiniflarPage() {
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);

  return (
    <AstraParitySorShell {...shell}>
      <div className="ap-class-empty">
        <h1>İlk sınıfına katıl</h1>
        <p>Öğretmeninin verdiği kodla sınıfa gir; ödev ve duyurular burada görünür.</p>
        <JoinClassForm />
      </div>
    </AstraParitySorShell>
  );
}
