import { notFound, redirect } from "next/navigation";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { ExamNodeSession } from "@/components/parity/exam-node-session";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import type { PlanNodeKind } from "@/lib/learning/exam-prep-plan";
import { examPrepLockedHref, needsExamIntro } from "@/lib/learning/exam-prep-hrefs";
import { parseMood, type Familiarity } from "@/lib/learning/session-signals";
import { moodAskedSince } from "@/lib/learning/lesson-open";
import { isFeatureEnabled, PDF_LEARNING_V2_FLAG } from "@/lib/admin/feature-flags";
import { createServiceClient } from "@/lib/supabase/server";
import { parseSessionMeta } from "@/lib/learning/teaching-standards";
import { topicStatusPct } from "@/lib/learning/oral-exam-chrome";
import { studyNodeOpenable } from "@/lib/learning/study-tools";
import { prepTopicMatch } from "@/lib/learning/prep-topic-lookup";
import { prepLanguage } from "@/lib/learning/teacher-brain";
import { prepSourceDocumentIds } from "@/lib/learning/prep-source";
import { parseTopicSourceRefs } from "@/lib/learning/topic-source-refs";
import { formatPageList } from "@/lib/learning/path-source-label";

/**
 * Konuya bağlı etkinlikler: "N kaynak" konunun kendi dosyalarını ve sayfalarını gösterir. Deneme,
 * son kontrol, zayıf nokta gibi bütün hazırlığı kapsayan işler bütün materyalleri gösterir.
 */
const TOPIC_SCOPED_KINDS = new Set<PlanNodeKind>(["lesson", "podcast", "qa", "quiz", "true_false", "spaced"]);

export const metadata = { title: "Ders" };

export default async function ExamNodePage({
  params,
  searchParams,
}: {
  params: Promise<{ prepId: string; nodeId: string }>;
  searchParams: Promise<{ konu?: string; tekrar?: string }>;
}) {
  const { prepId, nodeId } = await params;
  const { konu, tekrar } = await searchParams;
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
      .select("id, title, exam_type, active_topic_id, intro_completed_at, intro_deferred_at, document_id, learning_preferences")
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

  if (!prep || !node) notFound();
  // Kilitli adım adresten açılmaz (18 Ekim 2026, Astra'daki gibi): hazırlık sayfası o adımı
  // seçili gösterir, "Başka birini seç" oradan.
  if (!studyNodeOpenable(node.status, node.kind)) redirect(examPrepLockedHref(prepId, nodeId));

  // Yazılı deneme tek motor: kurulum → practice_exams.
  if (node.kind === "written_exam") {
    redirect(`/deneme-sinavlari/${prepId}/deneme/kurulum`);
  }

  const { data: nodeRows } = await supabase
    .from("exam_prep_nodes")
    .select("status")
    .eq("exam_prep_id", prepId);
  // Tanı zorunlu kapı değil (3 Ekim 2026, Astra): öğrenci bir etkinliği
  // açtıysa ölçüm ertelenir; seviye tespiti yolun başında düğüm olarak kalır.
  if (needsExamIntro(prep.intro_completed_at, nodeRows ?? [], prep.intro_deferred_at)) {
    await createServiceClient()
      .from("exam_preps")
      .update({ intro_deferred_at: new Date().toISOString() })
      .eq("id", prepId)
      .eq("user_id", user.id);
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
  let topicSourceRefs: unknown = null;

  const topicId = sessionMeta?.topicId ?? prep.active_topic_id;
  // Belgeli hazırlıkta düğüm belgedeki konu düğümünü tutar (`prepTopicMatch`); yalnız `id` ile
  // arama kurulumdaki aşinalığı bulmuyor, her açılışta yeniden soruyordu (18 Ekim 2026).
  const topicMatch = topicId ? prepTopicMatch(topicId) : null;
  if (topicMatch) {
    const { data: topic } = await supabase
      .from("exam_prep_topics")
      .select("label, familiarity, source_refs")
      .eq("exam_prep_id", prepId)
      .or(topicMatch)
      .limit(1)
      .maybeSingle();
    topicLabel = topicLabel ?? topic?.label ?? null;
    topicSourceRefs = topic?.source_refs ?? null;
    // Bu konuya daha önce girildiyse beyan edilen seviye varsayılan olur.
    topicFamiliarity = (topic?.familiarity as Familiarity | null) ?? null;
  }
  if (requestedTopic) topicLabel = requestedTopic;

  // Ruh hali günde bir kez (19 Ekim 2026): bugün verildiyse kart atlanır, o cevap kullanılır.
  const { data: moodToday } = await supabase
    .from("study_session_moods")
    .select("mood")
    .eq("user_id", user.id)
    .gte("created_at", moodAskedSince())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const todayMood = moodToday?.mood ? parseMood(moodToday.mood) : null;

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

  // "N kaynak": konuya bağlı etkinlikte konunun dosyaları ve sayfaları, öbürlerinde hazırlığın bütün
  // materyalleri. 19 Ekim 2026'ya kadar her derste yedi dosyanın yedisi "bu çalışma şu
  // materyallerden üretildi" diye listeleniyordu; ders yalnız PDF'in iki sayfasından yazılmıştı.
  // source_document_ids ayrı okunur — kolon yoksa tek belgeye düşülür (hazırlık sayfasıyla aynı).
  const { data: sourceIdRow } = await supabase
    .from("exam_preps")
    .select("source_document_ids")
    .eq("id", prepId)
    .maybeSingle();
  const rawSourceIds = (sourceIdRow as { source_document_ids?: unknown } | null)?.source_document_ids;
  const sourceIds = prepSourceDocumentIds({
    documentId: (prep.document_id as string | null) ?? null,
    sourceDocumentIds: Array.isArray(rawSourceIds)
      ? rawSourceIds.filter((id): id is string => typeof id === "string")
      : [],
  });
  const { data: sourceRows } = sourceIds.length
    ? await supabase
        .from("documents")
        .select("id, file_name")
        .in("id", sourceIds)
        .eq("user_id", user.id)
        .is("deleted_at", null)
    : { data: [] as { id: string; file_name: string }[] };
  const sourceById = new Map((sourceRows ?? []).map((row) => [row.id as string, row]));
  const topicPages = new Map<string, number[]>();
  if (TOPIC_SCOPED_KINDS.has(node.kind as PlanNodeKind)) {
    for (const ref of parseTopicSourceRefs(topicSourceRefs)) {
      if (!sourceIds.includes(ref.documentId)) continue;
      topicPages.set(ref.documentId, [...(topicPages.get(ref.documentId) ?? []), ...ref.pages]);
    }
  }
  const shownSourceIds = topicPages.size ? sourceIds.filter((id) => topicPages.has(id)) : sourceIds;
  const sources = shownSourceIds.flatMap((id) => {
    const row = sourceById.get(id);
    const pages = formatPageList(topicPages.get(id) ?? []);
    return row
      ? [{ id, name: (row.file_name as string) || "Belge", href: `/dokumanlar/${id}`, ...(pages ? { pages: `s.${pages}` } : {}) }]
      : [];
  });
  const sourceName =
    (prep.document_id ? sourceById.get(prep.document_id as string)?.file_name : null) ??
    sources[0]?.name ??
    null;

  return (
    <ParitySorShell {...shell} chrome="session">
      <ExamNodeSession
        prepId={prep.id}
        nodeId={node.id}
        kind={node.kind as PlanNodeKind}
        prepTitle={prep.title ?? "Sınav hazırlığı"}
        topicLabel={topicLabel}
        requestedTopic={requestedTopic || null}
        topicId={topicId ?? null}
        initialFamiliarity={topicFamiliarity}
        todayMood={todayMood}
        replayLesson={tekrar === "1"}
        resumeEnabled={resumeEnabled}
        sourceName={sourceName}
        sources={sources}
        oralTopics={oralTopics}
        language={prepLanguage(prep.learning_preferences)}
        subject={(prep.exam_type as string | null) ?? null}
        unitTitle={sessionMeta?.unitTitle ?? null}
      />
    </ParitySorShell>
  );
}
