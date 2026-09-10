import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { ExamCreateEntry } from "@/components/parity/exam-create-entry";
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

  // Ders seçiminde en üste öğrencinin hâlihazırda çalıştığı dersler gelsin.
  const { data: recentRows } = await supabase
    .from("exam_preps")
    .select("exam_type")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(12);

  const recentSubjects = [
    ...new Set(
      (recentRows ?? [])
        .map((row) => (row.exam_type as string | null)?.trim())
        .filter((value): value is string => Boolean(value && value.length > 1)),
    ),
  ].slice(0, 6);

  return (
    <AstraParitySorShell {...shell}>
      <ExamCreateEntry
        initialDocumentId={documentId}
        recentSubjects={recentSubjects}
      />
    </AstraParitySorShell>
  );
}
