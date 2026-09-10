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

  // "okul" ve "Okul" iki ayrı seçenek gibi görünüyordu — büyük/küçük harf
  // farkını yok sayarak ilk yazılışı korunur.
  const seenSubjects = new Map<string, string>();
  for (const row of recentRows ?? []) {
    const label = (row.exam_type as string | null)?.trim();
    if (!label || label.length < 2) continue;
    const key = label.toLocaleLowerCase("tr");
    if (!seenSubjects.has(key)) seenSubjects.set(key, label);
  }
  const recentSubjects = [...seenSubjects.values()].slice(0, 6);

  return (
    <AstraParitySorShell {...shell}>
      <ExamCreateEntry
        initialDocumentId={documentId}
        recentSubjects={recentSubjects}
      />
    </AstraParitySorShell>
  );
}
