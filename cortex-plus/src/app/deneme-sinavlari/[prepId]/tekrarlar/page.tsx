import { notFound, redirect } from "next/navigation";
import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { ExamPrepReviews } from "@/components/parity/exam-prep-reviews";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import {
  isFeatureEnabled,
  PDF_LEARNING_V2_FLAG,
} from "@/lib/admin/feature-flags";
import { createServiceClient } from "@/lib/supabase/server";
import { examPrepNodeHref } from "@/lib/learning/exam-prep-hrefs";

export const metadata = { title: "Yanlışlar ve tekrarlar" };
export const dynamic = "force-dynamic";

export default async function ExamPrepReviewsPage({
  params,
}: {
  params: Promise<{ prepId: string }>;
}) {
  const { prepId } = await params;
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);
  const service = createServiceClient();

  if (!(await isFeatureEnabled(service, PDF_LEARNING_V2_FLAG))) {
    redirect(`/deneme-sinavlari/${prepId}`);
  }

  const { data: prep } = await supabase
    .from("exam_preps")
    .select("id")
    .eq("id", prepId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!prep) notFound();

  const { data: rows } = await supabase
    .from("exam_prep_misconceptions")
    .select(
      "id, claim, corrected, wrong_type, topic_label, question_preview, created_at, node_id",
    )
    .eq("exam_prep_id", prepId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const { data: reviewNodes } = await supabase
    .from("exam_prep_nodes")
    .select("id, status, session_meta")
    .eq("exam_prep_id", prepId)
    .in("status", ["ready", "locked"]);

  const reviewReady =
    (reviewNodes ?? []).find((n) => {
      const meta =
        n.session_meta && typeof n.session_meta === "object"
          ? (n.session_meta as { role?: string })
          : null;
      return meta?.role === "review" && n.status === "ready";
    }) ??
    (reviewNodes ?? []).find((n) => {
      const meta =
        n.session_meta && typeof n.session_meta === "object"
          ? (n.session_meta as { role?: string })
          : null;
      return meta?.role === "review";
    });

  const items = (rows ?? []).map((row) => ({
    id: row.id as string,
    claim: row.claim as string,
    corrected: (row.corrected as string | null) ?? null,
    wrongType: (row.wrong_type as string) ?? "unknown",
    topicLabel: (row.topic_label as string | null) ?? null,
    questionPreview: (row.question_preview as string | null) ?? null,
    createdAt: row.created_at as string,
    reviewNodeHref: reviewReady
      ? examPrepNodeHref(prepId, reviewReady.id as string)
      : row.node_id
        ? examPrepNodeHref(prepId, row.node_id as string)
        : null,
  }));

  return (
    <AstraParitySorShell {...shell}>
      <ExamPrepReviews prepId={prepId} items={items} />
    </AstraParitySorShell>
  );
}
