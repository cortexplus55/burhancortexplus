import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { ToolsHub } from "@/components/parity/tools-hub";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";

export const metadata = { title: "Araçlar" };

export default async function AraclarPage() {
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);

  return (
    <AstraParitySorShell {...shell}>
      <ToolsHub />
    </AstraParitySorShell>
  );
}
