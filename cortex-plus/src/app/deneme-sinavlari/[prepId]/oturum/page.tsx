import { notFound, redirect } from "next/navigation";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { AdaptiveStudySession } from "@/components/parity/adaptive-study-session";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import {
  ADAPTIVE_LEARNING_FLAG,
  isFeatureEnabled,
} from "@/lib/admin/feature-flags";
import { createServiceClient } from "@/lib/supabase/server";
import { examPrepHomeHref } from "@/lib/learning/exam-prep-hrefs";

export const metadata = { title: "Çalışma oturumu" };
export const dynamic = "force-dynamic";

export default async function AdaptiveOturumPage({
  params,
}: {
  params: Promise<{ prepId: string }>;
}) {
  const { prepId } = await params;
  const { supabase, user } = await requireStudentArea();
  const service = createServiceClient();

  if (!(await isFeatureEnabled(service, ADAPTIVE_LEARNING_FLAG, user.id))) {
    redirect(examPrepHomeHref(prepId));
  }

  const { data: prep } = await supabase
    .from("exam_preps")
    .select("id, title, exam_date")
    .eq("id", prepId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!prep) notFound();

  const shell = await loadParityShellProps(supabase, user.id, user.email);
  const daysRemaining = prep.exam_date
    ? Math.max(
        0,
        Math.ceil(
          (new Date(`${prep.exam_date}T23:59:59`).getTime() - Date.now()) /
            86_400_000,
        ),
      )
    : null;

  return (
    <ParitySorShell {...shell}>
      <AdaptiveStudySession
        prepId={prepId}
        prepTitle={String(prep.title ?? "Sınav hazırlığı")}
        daysRemaining={daysRemaining}
      />
    </ParitySorShell>
  );
}
