import { notFound } from "next/navigation";
import { ChallengeSetPlay } from "@/components/parity/challenge-set-play";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";

export const metadata = { title: "Zor sorular" };
export const dynamic = "force-dynamic";

export default async function ChallengePage({
  params,
}: {
  params: Promise<{ prepId: string }>;
}) {
  const { prepId } = await params;
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);
  const { data: prep } = await supabase
    .from("exam_preps")
    .select("id")
    .eq("id", prepId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!prep) notFound();

  return (
    <ParitySorShell {...shell}>
      <ChallengeSetPlay prepId={prepId} />
    </ParitySorShell>
  );
}
