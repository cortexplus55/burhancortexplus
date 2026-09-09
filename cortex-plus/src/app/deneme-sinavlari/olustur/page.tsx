import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { ExamCreateChat } from "@/components/parity/exam-create-chat";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";

export const metadata = { title: "Sınav oluştur" };
export const dynamic = "force-dynamic";

export default async function ExamCreatePage({
  searchParams,
}: {
  searchParams: Promise<{ documentId?: string }>;
}) {
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);
  const params = await searchParams;
  const documentId =
    typeof params.documentId === "string" &&
    /^[0-9a-f-]{36}$/i.test(params.documentId)
      ? params.documentId
      : null;

  return (
    <AstraParitySorShell {...shell}>
      <ExamCreateChat initialDocumentId={documentId} />
    </AstraParitySorShell>
  );
}
