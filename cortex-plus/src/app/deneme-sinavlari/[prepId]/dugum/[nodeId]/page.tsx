import { notFound, redirect } from "next/navigation";
import { AstraParitySorShell } from "@/components/parity/astra-parity-sor-shell";
import { ExamNodeSession } from "@/components/parity/exam-node-session";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import type { PlanNodeKind } from "@/lib/learning/exam-prep-plan";
import { examPrepIntroHref, needsExamIntro } from "@/lib/learning/exam-prep-hrefs";
import type { Familiarity } from "@/lib/learning/session-signals";
import { isFeatureEnabled, PDF_LEARNING_V2_FLAG } from "@/lib/admin/feature-flags";
import { createServiceClient } from "@/lib/supabase/server";
import { parseSessionMeta } from "@/lib/learning/teaching-standards";

export const metadata = { title: "Ders" };

export default async function ExamNodePage({
  params,
}: {
  params: Promise<{ prepId: string; nodeId: string }>;
}) {
  const { prepId, nodeId } = await params;
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);
  const resumeEnabled = await isFeatureEnabled(
    createServiceClient(),
    PDF_LEARNING_V2_FLAG,
  );

  const [{ data: prep }, { data: node }] = await Promise.all([
    supabase
      .from("exam_preps")
      .select("id, title, active_topic_id, intro_completed_at, document_id")
      .eq("id", prepId)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("exam_prep_nodes")
      .select("id, kind, status, session_meta")
      .eq("id", nodeId)
      .eq("exam_prep_id", prepId)
      .maybeSingle(),
  ]);

  if (!prep || !node || node.status === "locked") notFound();

  const { data: nodeRows } = await supabase
    .from("exam_prep_nodes")
    .select("status")
    .eq("exam_prep_id", prepId);
  if (needsExamIntro(prep.intro_completed_at, nodeRows ?? [])) {
    redirect(examPrepIntroHref(prepId));
  }

  // Etiket, düğümün kendi konusundan gelir.
  //
  // Burada yalnızca prep.active_topic_id okunuyordu; üretimi yapan node route
  // ise session_meta.topicTitle'ı tercih ediyor. Öğrenci aktif konu dışında bir
  // düğüm açtığında kurulum ekranı "Üs Kavramı ve Tanımı" derken üretilen ders
  // "Aynı Tabanlı İfadelerde Çarpma ve Bölme" çıkıyordu. İki taraf da aynı
  // önceliği kullanmalı.
  const sessionMeta = parseSessionMeta(node.session_meta);
  let topicLabel: string | null = sessionMeta?.topicTitle?.trim() || null;
  let topicFamiliarity: Familiarity | null = null;

  const topicId = sessionMeta?.topicId ?? prep.active_topic_id;
  if (topicId) {
    const { data: topic } = await supabase
      .from("exam_prep_topics")
      .select("label, familiarity")
      .eq("id", topicId)
      .maybeSingle();
    topicLabel = topicLabel ?? topic?.label ?? null;
    // Bu konuya daha önce girildiyse beyan edilen seviye varsayılan olur.
    topicFamiliarity = (topic?.familiarity as Familiarity | null) ?? null;
  }

  // Üretim ekranı "senin notundan çıkıyor" diyebilsin diye kaynak dosya adı.
  // Hazırlık bir belgeye bağlı değilse gösterilmez — olmayan bir güvence
  // vermemek için.
  let sourceName: string | null = null;
  if (prep.document_id) {
    const { data: doc } = await supabase
      .from("documents")
      .select("file_name")
      .eq("id", prep.document_id)
      .maybeSingle();
    sourceName = (doc?.file_name as string | null) ?? null;
  }

  return (
    <AstraParitySorShell {...shell}>
      <ExamNodeSession
        prepId={prep.id}
        nodeId={node.id}
        kind={node.kind as PlanNodeKind}
        prepTitle={prep.title ?? "Sınav hazırlığı"}
        topicLabel={topicLabel}
        initialFamiliarity={topicFamiliarity}
        resumeEnabled={resumeEnabled}
        sourceName={sourceName}
      />
    </AstraParitySorShell>
  );
}
