import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { ExamCreateChat } from "@/components/parity/exam-create-chat";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";

export const metadata = { title: "Sınav oluştur" };

export default async function ExamCreatePage() {
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);

  return (
    <AstraParitySorShell {...shell}>
      <ExamCreateChat />
    </AstraParitySorShell>
  );
}
