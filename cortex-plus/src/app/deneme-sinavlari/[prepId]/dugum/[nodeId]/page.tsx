import { notFound, redirect } from "next/navigation";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { ExamNodeSession } from "@/components/parity/exam-node-session";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import type { PlanNodeKind } from "@/lib/learning/exam-prep-plan";
import {
  examPrepLessonRewriteHref,
  examPrepLockedHref,
  needsExamIntro,
  opensSavedLesson,
} from "@/lib/learning/exam-prep-hrefs";
import { parseMood, type Familiarity } from "@/lib/learning/session-signals";
import { moodAskedSince } from "@/lib/learning/lesson-open";
import { isFeatureEnabled, PDF_LEARNING_V2_FLAG } from "@/lib/admin/feature-flags";
import { createServiceClient } from "@/lib/supabase/server";
import { parseSessionMeta } from "@/lib/learning/teaching-standards";
import {
  MASTERY_ROW_COLUMNS,
  isMeasuredTopic,
  masteryByPlannedTopic,
  masterySnapshotFromRow,
  topicMasteryPercent,
} from "@/lib/learning/learning-tracking";
import { nodeNeedsStudentUnlock, studentMayStartNode } from "@/lib/learning/study-tools";
import { prepTopicMatch } from "@/lib/learning/prep-topic-lookup";
import { prepLanguage } from "@/lib/learning/teacher-brain";
import { prepSourceDocumentIds } from "@/lib/learning/prep-source";
import { parseTopicSourceRefs } from "@/lib/learning/topic-source-refs";
import { formatPageList } from "@/lib/learning/path-source-label";
import { loadTopicSupport } from "@/lib/learning/topic-support-load";
import { FIGURE_APPENDIX_LABEL } from "@/lib/documents/extract-image-text";
import { figureHintsFromRows, type FigureHint } from "@/lib/learning/figure-pages";
import { ALL_TOPICS_KINDS, ALL_TOPICS_LABEL } from "@/lib/learning/prep-wide-target";

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
  searchParams: Promise<{ konu?: string; tekrar?: string; incele?: string; farkli?: string }>;
}) {
  const { prepId, nodeId } = await params;
  const { konu, tekrar, incele, farkli } = await searchParams;
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
  // Gizli düğüm açılmaz. Kilitli düğüm öğrencinin kendi hazırlığındaysa ready olur ve açılır
  // (27 Ekim 2026). Bitirme fonksiyonu kilitli satırı reddeder.
  if (!studentMayStartNode(node.status, node.kind)) redirect(examPrepLockedHref(prepId, nodeId));
  if (nodeNeedsStudentUnlock(node.status)) {
    await createServiceClient()
      .from("exam_prep_nodes")
      .update({ status: "ready" })
      .eq("id", nodeId)
      .eq("exam_prep_id", prepId)
      .eq("status", "locked");
  }

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
  let topicRowId: string | null = null;

  const topicId = sessionMeta?.topicId ?? prep.active_topic_id;
  // Belgeli hazırlıkta düğüm belgedeki konu düğümünü tutar (`prepTopicMatch`); yalnız `id` ile
  // arama kurulumdaki aşinalığı bulmuyor, her açılışta yeniden soruyordu (18 Ekim 2026).
  const topicMatch = topicId ? prepTopicMatch(topicId) : null;
  if (topicMatch) {
    const { data: topic } = await supabase
      .from("exam_prep_topics")
      .select("id, label, familiarity, source_refs")
      .eq("exam_prep_id", prepId)
      .or(topicMatch)
      .limit(1)
      .maybeSingle();
    topicLabel = topicLabel ?? topic?.label ?? null;
    topicSourceRefs = topic?.source_refs ?? null;
    topicRowId = (topic?.id as string | undefined) ?? null;
    // Bu konuya daha önce girildiyse beyan edilen seviye varsayılan olur.
    topicFamiliarity = (topic?.familiarity as Familiarity | null) ?? null;
  }
  if (requestedTopic) topicLabel = requestedTopic;
  // Bütün konuları kapsayan adımın (son kontrol, Hazırsın) başlığı devraldığı 1. konu değil (Paket I #8).
  else if (ALL_TOPICS_KINDS.has(node.kind as PlanNodeKind)) topicLabel = ALL_TOPICS_LABEL;

  // Açık oturum var mı? Yoksa istemci "kaldığın yer" sorgusunu atlar (20 Ekim 2026: yeni derste her
  // açılışta ~5 sn "Kaldığın yer açılıyor" yazıyordu). Yazılı denemede tamamlanmış kağıt incelemesi
  // aynı sorgudan geldiği için orada hep sorulur; okuma düşerse sorulur.
  let openAttempt = true;
  if (resumeEnabled && node.kind !== "written_exam") {
    const { data: active, error: activeError } = await supabase
      .from("exam_prep_node_attempts")
      .select("id")
      .eq("user_id", user.id)
      .eq("exam_prep_id", prepId)
      .eq("node_id", nodeId)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();
    openAttempt = Boolean(activeError) || Boolean(active);
  }

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
  let oralTopics: { id: string; label: string; pct: number; measured?: boolean }[] = [];
  if (node.kind === "oral") {
    const [{ data: topicRows }, { data: masteryRows }] = await Promise.all([
      supabase.from("exam_prep_topics").select("id, label, sort_order, status").eq("exam_prep_id", prepId).order("sort_order"),
      supabase
        .from("exam_prep_topic_mastery")
        .select(MASTERY_ROW_COLUMNS)
        .eq("user_id", user.id)
        .eq("exam_prep_id", prepId),
    ]);
    // Ölçülmemiş konu seçicide "Ölçülmedi" yazar, "%0" değil (Paket I #7). Hâkimiyet konuya tek eşleştiriciyle
    // bağlanır (`masteryByPlannedTopic`, 30 Ekim 2026): İlerleme ve yol ile aynı sayı.
    const byTopic = masteryByPlannedTopic(
      (topicRows ?? []).map((topic) => String(topic.label ?? "")),
      ((masteryRows ?? []) as Record<string, unknown>[]).map(masterySnapshotFromRow),
    );
    oralTopics = (topicRows ?? []).map((topic) => {
      const snapshot = byTopic.get(String(topic.label ?? ""));
      return {
        id: topic.id,
        label: topic.label,
        pct: snapshot ? topicMasteryPercent(snapshot) : 0,
        measured: isMeasuredTopic(snapshot),
      };
    });
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
  // Konunun yardımcı kaynakları (defter, test, kart fotoğrafı): derse giren her dosya listede olsun.
  const support =
    TOPIC_SCOPED_KINDS.has(node.kind as PlanNodeKind) && topicRowId
      ? await loadTopicSupport(createServiceClient(), { userId: user.id, prepId, topicId: topicRowId })
      : [];
  const supportByDoc = new Map<string, string[]>();
  const supportPagesByDoc = new Map<string, Set<number>>();
  for (const excerpt of support) {
    const where = excerpt.part ? `parça ${excerpt.part}` : excerpt.pageCount > 1 ? `s.${excerpt.page}` : "";
    supportByDoc.set(excerpt.documentId, [...(supportByDoc.get(excerpt.documentId) ?? []), where]);
    if (Number.isInteger(excerpt.page) && excerpt.page > 0) {
      const set = supportPagesByDoc.get(excerpt.documentId) ?? new Set<number>();
      set.add(excerpt.page);
      supportPagesByDoc.set(excerpt.documentId, set);
    }
  }
  const shownSourceIds = topicPages.size
    ? sourceIds.filter((id) => topicPages.has(id) || supportByDoc.has(id))
    : sourceIds;
  // Şekil okunmuş sayfalar (29 Ekim 2026): dersin adımı bu sayfadaysa belgedeki şema derse gömülür.
  // Sorgu eke bakar, karar kodda (Paket H): ekte sayfanın metninde geçmeyen, veri taşıyan satır
  // yoksa sayfa şekil sayfası değildir — eski kayıtlardaki sahte ekler (içindekiler) böylece elenir.
  // Belge kümesi aynen shownSourceIds; anahtar document_id (görsel belgenin 1. sayfası PDF'inkiyle
  // karışmaz). Konuya bağlı etkinlikte yalnız konunun (ve yardımcı kaynağın) sayfaları.
  const figureHintsByDoc = new Map<string, FigureHint[]>();
  if (shownSourceIds.length) {
    const { data: figureRows } = await supabase
      .from("document_pages")
      .select("document_id, page_number, text_content")
      .in("document_id", shownSourceIds)
      .ilike("text_content", `%${FIGURE_APPENDIX_LABEL}%`)
      .limit(300);
    for (const [id, hints] of figureHintsFromRows(figureRows ?? [])) {
      const own = topicPages.get(id);
      const extra = supportPagesByDoc.get(id);
      const scope = own?.length || extra?.size ? new Set<number>([...(own ?? []), ...(extra ?? [])]) : null;
      const kept = scope ? hints.filter((hint) => scope.has(hint.page)) : hints;
      if (kept.length) figureHintsByDoc.set(id, kept);
    }
  }
  const sources = shownSourceIds.flatMap((id) => {
    const row = sourceById.get(id);
    const own = formatPageList(topicPages.get(id) ?? []);
    const extra = [...new Set((supportByDoc.get(id) ?? []).filter(Boolean))];
    const extraText = extra.length ? `ek: ${extra.join(", ")}` : supportByDoc.has(id) ? "ek kaynak" : "";
    const pages = [own ? `s.${own}` : "", extraText].filter(Boolean).join(" · ");
    const figureHints = figureHintsByDoc.get(id);
    return row
      ? [
          {
            id,
            name: (row.file_name as string) || "Belge",
            href: `/dokumanlar/${id}`,
            ...(pages ? { pages } : {}),
            ...(figureHints?.length
              ? { figurePages: figureHints.map((hint) => hint.page), figureHints }
              : {}),
          },
        ]
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
        // İstemciye konunun gerçek kimliği (30 Ekim 2026): düğüm belge konu düğümünü taşıyor, "Şimdi dinle" bu
        // ham kimlikle 404 alıyordu (canlıda 1.851 konulu adımın 1.830ı).
        topicId={topicRowId ?? topicId ?? null}
        initialFamiliarity={topicFamiliarity}
        todayMood={todayMood}
        replayLesson={tekrar === "1"}
        // Bitmiş ders düz adresle açılınca kayıtlı hâli (30 Ekim 2026, `opensSavedLesson`); yeni yazım "Farklı anlat"la.
        reviewSaved={opensSavedLesson({ kind: node.kind as string, status: node.status as string, query: { incele, tekrar, farkli, konu } })}
        rewriteHref={node.kind === "lesson" ? examPrepLessonRewriteHref(prepId, nodeId) : null}
        resumeEnabled={resumeEnabled}
        openAttempt={openAttempt}
        sourceName={sourceName}
        sources={sources}
        oralTopics={oralTopics}
        language={prepLanguage(prep.learning_preferences)}
        subject={(prep.exam_type as string | null) ?? null}
        unitTitle={sessionMeta?.unitTitle ?? null}
        activityMinutes={sessionMeta?.activityMinutes ?? null}
        nodeDone={node.status === "done"}
      />
    </ParitySorShell>
  );
}
