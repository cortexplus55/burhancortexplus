import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { UygulamalarLabGrid } from "@/components/parity/uygulamalar-lab-client";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";

export const metadata = { title: "Öğrenme uygulamaları" };

export default async function UygulamalarPage() {
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);

  return (
    <AstraParitySorShell {...shell}>
      <UygulamalarLabGrid />
    </AstraParitySorShell>
  );
}
