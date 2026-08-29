import { notFound } from "next/navigation";
import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { ExamPrepStudySession } from "@/components/parity/exam-prep-study-session";
import { requireStudentArea } from "@/lib/auth/session";
import { isPremiumUser } from "@/lib/ai/generate";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";

export const metadata = { title: "Ders oturumu" };

export default async function ExamPrepCalisPage({
  params,
}: {
  params: Promise<{ prepId: string }>;
}) {
  const { prepId } = await params;
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);

  const [{ data: prep }, isPremium, { data: session }] = await Promise.all([
    supabase
      .from("exam_preps")
      .select("id, title")
      .eq("id", prepId)
      .eq("user_id", user.id)
      .maybeSingle(),
    isPremiumUser(supabase, user.id),
    supabase
      .from("exam_prep_sessions")
      .select("id, conversation_id")
      .eq("exam_prep_id", prepId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!prep) notFound();

  return (
    <AstraParitySorShell {...shell}>
      <ExamPrepStudySession
        prepId={prep.id}
        prepTitle={prep.title ?? "Sınav hazırlığı"}
        sessionId={session?.id}
        conversationId={session?.conversation_id ?? undefined}
        isPremium={isPremium}
      />
    </AstraParitySorShell>
  );
}
