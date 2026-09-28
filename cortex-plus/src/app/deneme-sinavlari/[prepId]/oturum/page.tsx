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
import { daysUntilDate } from "@/lib/learning/exam-countdown";

export const metadata = { title: "Çalışma oturumu" };
export const dynamic = "force-dynamic";

export default async function AdaptiveOturumPage({
  params,
  searchParams,
}: {
  params: Promise<{ prepId: string }>;
  searchParams: Promise<{ planItemId?: string }>;
}) {
  const { prepId } = await params;
  const { planItemId } = await searchParams;
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
    ? Math.max(0, daysUntilDate(String(prep.exam_date)))
    : null;

  return (
    <ParitySorShell {...shell}>
      <AdaptiveStudySession
        prepId={prepId}
        prepTitle={String(prep.title ?? "Sınav hazırlığı")}
        daysRemaining={daysRemaining}
        planItemId={planItemId && /^[0-9a-f-]{36}$/i.test(planItemId) ? planItemId : null}
      />
    </ParitySorShell>
  );
}
