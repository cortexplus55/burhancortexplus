import { ParitySorShell } from "@/components/parity/sor-shell";
import { ExamCreateEntry } from "@/components/parity/exam-create-entry";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { freePrepLimitReached } from "@/lib/billing/free-prep-limit";
import { createServiceClient } from "@/lib/supabase/server";

export const metadata = { title: "Sınav oluştur" };
export const dynamic = "force-dynamic";

export default async function ExamCreatePage({
  searchParams,
}: {
  searchParams: Promise<{ documentId?: string; ders?: string; istem?: string }>;
}) {
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);
  const params = await searchParams;
  const documentId =
    typeof params.documentId === "string" &&
    /^[0-9a-f-]{36}$/i.test(params.documentId)
      ? params.documentId
      : null;

  // Müfredatım / Resmî sınavlar kartları kurulumu ders ve ilk mesaj dolu açar.
  const clip = (value: unknown, max: number) =>
    typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
  const initialSubject = clip(params.ders, 60);
  const initialPrompt = clip(params.istem, 300);

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
    <ParitySorShell {...shell}>
      <ExamCreateEntry
        initialDocumentId={documentId}
        recentSubjects={recentSubjects}
        initialSubject={initialSubject}
        initialPrompt={initialPrompt}
        prepLimitReached={await freePrepLimitReached(createServiceClient(), user.id)}
      />
    </ParitySorShell>
  );
}
