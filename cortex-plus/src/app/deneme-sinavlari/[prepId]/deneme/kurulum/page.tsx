import { notFound } from "next/navigation";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { MockExamSetup } from "@/components/parity/mock-exam-setup";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { isAdminUser } from "@/lib/auth/roles";
import {
  allocateQuestions,
  parseExamFormatFromText,
  type MockTopicSlot,
} from "@/lib/learning/mock-exam";

export const metadata = { title: "Yazılı deneme · Cortex Plus" };
export const dynamic = "force-dynamic";

export default async function MockExamSetupPage({
  params,
}: {
  params: Promise<{ prepId: string }>;
}) {
  const { prepId } = await params;
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);
  const admin = await isAdminUser(supabase, user.id);

  const { data: prep } = await supabase
    .from("exam_preps")
    .select("id")
    .eq("id", prepId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!prep) notFound();

  const { data: topics } = await supabase
    .from("exam_prep_topics")
    .select("id, label, source_refs")
    .eq("exam_prep_id", prepId)
    .order("sort_order");

  const slots: MockTopicSlot[] = (topics ?? []).map((t) => ({
    topicId: t.id as string,
    topicLabel: t.label as string,
    weightPercent: null,
    examHeavy: false,
    outOfScope: false,
    passageChars: 100,
  }));

  // Biçim özeti: ilk sayfa metinlerinden (hafif)
  let formatSummary: string | null = null;
  try {
    const { data: docs } = await supabase
      .from("exam_prep_source_documents")
      .select("document_id")
      .eq("exam_prep_id", prepId)
      .limit(3);
    const ids = (docs ?? []).map((d) => d.document_id as string);
    if (ids.length) {
      const { data: pages } = await supabase
        .from("document_pages")
        .select("text_content")
        .in("document_id", ids)
        .limit(8);
      const text = (pages ?? []).map((p) => String(p.text_content ?? "")).join("\n");
      formatSummary = parseExamFormatFromText(text)?.summary ?? null;
    }
  } catch {
    formatSummary = null;
  }

  const allocation = allocateQuestions(slots, formatSummary ? 22 : 20).map((row) => ({
    topicLabel: row.topicLabel,
    count: row.count,
    examHeavy: row.examHeavy,
  }));

  return (
    <ParitySorShell {...shell}>
      <MockExamSetup
        prepId={prepId}
        topics={(topics ?? []).map((t) => ({
          id: t.id as string,
          label: t.label as string,
        }))}
        formatSummary={formatSummary}
        isAdmin={admin}
        allocationPreview={allocation}
      />
    </ParitySorShell>
  );
}
