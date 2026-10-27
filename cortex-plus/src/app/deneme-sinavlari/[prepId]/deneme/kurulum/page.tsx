import { notFound } from "next/navigation";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { MockExamSetup } from "@/components/parity/mock-exam-setup";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { isAdminUser } from "@/lib/auth/roles";
import { loadMockExamSetup } from "@/lib/learning/mock-exam/create";

export const metadata = { title: "Yazılı deneme" };
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

  const rows = (topics ?? []).map((t) => ({
    id: t.id as string,
    label: t.label as string,
    source_refs: t.source_refs as unknown,
  }));
  // Üretimle aynı okuma: aynı konu yerleri, aynı kapsam dışı işareti, aynı sınav biçimi (Paket A).
  const setup = await loadMockExamSetup(supabase, user.id, prepId, rows).catch(() => null);
  const slots = setup?.slots ?? [];
  const syllabus = setup?.syllabus ?? null;

  return (
    <ParitySorShell {...shell}>
      <MockExamSetup
        prepId={prepId}
        topics={rows.map((row, index) => ({
          id: row.id,
          label: row.label,
          outOfScope: slots[index]?.outOfScope ?? false,
          examHeavy: slots[index]?.examHeavy ?? false,
          weightPercent: slots[index]?.weightPercent ?? null,
        }))}
        formatSummary={syllabus?.summary ?? null}
        realMinutes={syllabus?.durationMinutes ?? null}
        realQuestionCount={syllabus?.slots.length ?? null}
        isAdmin={admin}
      />
    </ParitySorShell>
  );
}
