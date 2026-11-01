import { notFound } from "next/navigation";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { MockExamSetup } from "@/components/parity/mock-exam-setup";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { isAdminUser } from "@/lib/auth/roles";
import { applyPastWeights, loadMockExamSetup, loadPastQuestions } from "@/lib/learning/mock-exam/create";
import { PAST_MIN_QUESTIONS } from "@/lib/learning/mock-exam/past-questions";

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
  // İkiz sınav (31 Ekim 2026, Paket J3 #11): belgede çıkmış soru varsa seçenek; önizleme üretimin ağırlığını okur.
  const past = await loadPastQuestions(supabase, prepId);
  const twinSlots = slots.map((slot) => ({ ...slot }));
  if (past.length >= PAST_MIN_QUESTIONS) applyPastWeights(twinSlots, past);

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
          officialCount: slots[index]?.officialCount ?? null,
        }))}
        formatSummary={syllabus?.summary ?? setup?.official?.summary ?? null}
        realMinutes={syllabus?.durationMinutes ?? null}
        realQuestionCount={syllabus ? syllabus.slots.length : (setup?.official?.total ?? null)}
        pastQuestions={
          past.length >= PAST_MIN_QUESTIONS
            ? {
                count: past.length,
                weights: Object.fromEntries(rows.map((row, index) => [row.id, twinSlots[index]?.weightPercent ?? null])),
              }
            : null
        }
        isAdmin={admin}
      />
    </ParitySorShell>
  );
}
