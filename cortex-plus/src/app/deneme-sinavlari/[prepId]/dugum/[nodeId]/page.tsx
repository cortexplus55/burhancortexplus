import { notFound, redirect } from "next/navigation";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { ExamNodeSession } from "@/components/parity/exam-node-session";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import type { PlanNodeKind } from "@/lib/learning/exam-prep-plan";
import { examPrepIntroHref, needsExamIntro } from "@/lib/learning/exam-prep-hrefs";
import type { Familiarity } from "@/lib/learning/session-signals";
import { isFeatureEnabled, PDF_LEARNING_V2_FLAG } from "@/lib/admin/feature-flags";
import { createServiceClient } from "@/lib/supabase/server";
import { parseSessionMeta } from "@/lib/learning/teaching-standards";
import { topicStatusPct } from "@/lib/learning/oral-exam-chrome";
import { studyNodeOpenable } from "@/lib/learning/study-tools";
import { prepLanguage } from "@/lib/learning/teacher-brain";

export const metadata = { title: "Ders" };

export default async function ExamNodePage({
  params,
  searchParams,
}: {
  params: Promise<{ prepId: string; nodeId: string }>;
  searchParams: Promise<{ konu?: string }>;
}) {
  const { prepId, nodeId } = await params;
  const { konu } = await searchParams;
  const requestedTopic = typeof konu === "string" ? konu.trim().slice(0, 400) : "";
  const { supabase, user } = await requireStudentArea();
  const shell = await loadParityShellProps(supabase, user.id, user.email);
  const resumeEnabled = await isFeatureEnabled(
    createServiceClient(),
    PDF_LEARNING_V2_FLAG,
  );

  const [{ data: prep }, { data: node }] = await Promise.all([
    supabase
      .from("exam_preps")
      .select("id, title, active_topic_id, intro_completed_at, intro_deferred_at, document_id, learning_preferences")
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

  if (!prep || !node || !studyNodeOpenable(node.status)) notFound();

  // Yazılı deneme tek motor: kurulum → practice_exams.
  if (node.kind === "written_exam") {
    redirect(`/deneme-sinavlari/${prepId}/deneme/kurulum`);
  }

  const { data: nodeRows } = await supabase
    .from("exam_prep_nodes")
    .select("status")
    .eq("exam_prep_id", prepId);
  if (needsExamIntro(prep.intro_completed_at, nodeRows ?? [], prep.intro_deferred_at)) {
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
  if (requestedTopic) topicLabel = requestedTopic;

  // Üretim ekranı "senin notundan çıkıyor" diyebilsin diye kaynak dosya adı.
  // Hazırlık bir belgeye bağlı değilse gösterilmez — olmayan bir güvence
  // vermemek için.
  let oralTopics: { id: string; label: string; pct: number }[] = [];
  if (node.kind === "oral") {
    const { data: topicRows } = await supabase
      .from("exam_prep_topics")
      .select("id, label, sort_order, status")
      .eq("exam_prep_id", prepId)
      .order("sort_order");
    oralTopics = (topicRows ?? []).map((topic) => ({
      id: topic.id,
      label: topic.label,
      pct: topicStatusPct(topic.status),
    }));
  }

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
    <ParitySorShell {...shell}>
      <ExamNodeSession
        prepId={prep.id}
        nodeId={node.id}
        kind={node.kind as PlanNodeKind}
        prepTitle={prep.title ?? "Sınav hazırlığı"}
        topicLabel={topicLabel}
        requestedTopic={requestedTopic || null}
        topicId={topicId ?? null}
        initialFamiliarity={topicFamiliarity}
        resumeEnabled={resumeEnabled}
        sourceName={sourceName}
        oralTopics={oralTopics}
        language={prepLanguage(prep.learning_preferences)}
      />
    </ParitySorShell>
  );
}
