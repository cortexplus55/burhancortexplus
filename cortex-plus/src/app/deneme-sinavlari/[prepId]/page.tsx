import { officialPlanNote, officialSourceNote, readCurriculumRef } from "@/lib/curriculum/registry";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { headers } from "next/headers";
import { requestPrepPrefetch } from "@/lib/learning/lesson-prefetch";
import { reindexEvictedForPrep } from "@/lib/documents/vector-lifecycle";
import { embedTexts } from "@/lib/rag/pipeline";
import { ParitySorShell } from "@/components/parity/sor-shell";
import { UnitLevelCheck } from "@/components/level-check/unit-level-check";
import { unitCheckOffer } from "@/lib/level-check/unit-offer";
import { MasteryMap } from "@/components/level-check/mastery-map";
import { loadMapInputs } from "@/lib/mastery-map/load";
import { prepNetEstimate } from "@/lib/mastery-map/net-load";
import { ExamPrepHome, type LearningTrackingView } from "@/components/parity/exam-prep-home";
import { requireStudentArea } from "@/lib/auth/session";
import { loadParityShellProps } from "@/lib/student/parity-shell-props";
import { loadOrBackfillTopics } from "@/lib/learning/exam-prep-topics";
import { topicProgress } from "@/lib/learning/exam-prep-progress";
import { ensurePathSkeletonNodes, ensurePrepNodes } from "@/lib/learning/exam-prep-insert";
import {
  daysUntilExam,
  type PlanNodeKind,
} from "@/lib/learning/exam-prep-plan";
import { pathCompletion } from "@/lib/learning/prep-metrics";
import { PREP_WIDE_TARGET_KINDS, prepWideTargetTopic, rankFinalStepTopics } from "@/lib/learning/prep-wide-target";
import {
  examPrepHomeHref,
  examPrepIntroHref,
  examPrepNodeHref,
  examPrepTopicHref,
} from "@/lib/learning/exam-prep-hrefs";
import {
  isFeatureEnabled,
  PDF_LEARNING_V2_FLAG,
} from "@/lib/admin/feature-flags";
import { createServiceClient } from "@/lib/supabase/server";
import { pathSkipKinds } from "@/lib/billing/node-free-meter";
import {
  buildLearningIndicators,
  freePathUnblockIds,
  masteryByPlannedTopic,
  preferNextNodeForTracking,
  topicMasteryView,
  weakOrStaleTopicKeys,
  type TopicMasterySnapshot,
} from "@/lib/learning/learning-tracking";
import { countOpenMisconceptions, withOpenMisconceptions } from "@/lib/learning/misconception-store";
import { parseLearningPreferences } from "@/lib/learning/exam-prep-ui-path";
import { examTimeFromPreferences } from "@/lib/learning/exam-time";
import { istanbulDay } from "@/lib/istanbul-day";
import { prepDailyMinutes, prepStudyDays } from "@/lib/learning/exam-schedule-v2";
import { shouldShowLevelNode } from "@/lib/learning/path-level";
import { materialKindLabel, prepSourceDocumentIds } from "@/lib/learning/prep-source";
import {
  formatContradictions,
  type TopicContradiction,
} from "@/lib/learning/source-contradictions";
import { attemptTopicFields, buildPrepProgressView, solvedQuestions } from "@/lib/learning/prep-progress-view";
import { retentionFromTopics } from "@/lib/learning/prep-radar";
// Günü gelen tekrar (20 Ekim 2026): "Bugün N tekrar"; anahtar kapalıysa ya da tablo yoksa 0.
import { dueReviewCountForPrep } from "@/lib/learning/review-items-store";
import { countPendingMaterials } from "@/lib/learning/pending-materials";
import { createPrepInviteToken, prepInviteUrl } from "@/lib/learning/prep-invite";
import { prepInviteWhatsappHref } from "@/lib/learning/prep-share";
import { examDatePassed, examResultDue } from "@/lib/learning/exam-result";
import { loadExamBaseline } from "@/lib/learning/exam-result-load";
import { appOrigin } from "@/lib/app-url";
import { freeTopicLocks } from "@/lib/billing/free-topic-gate";
import { poolLessonPreview } from "@/lib/content-pool/lesson-preview";
import { getUserEntitlements } from "@/lib/billing/entitlements";
import { loadPlusPrices } from "@/lib/billing/plan-prices";
import { campOffer } from "@/lib/camp/offer";
import { CampCard } from "@/components/camp/camp-card";
import type { SupabaseClient } from "@supabase/supabase-js";

export const metadata = { title: "Sınav hazırlığı" };
export const dynamic = "force-dynamic";

async function loadTopicWarnings(
  supabase: SupabaseClient,
  prepId: string,
): Promise<Record<string, string>> {
  const { data, error } = await supabase
    .from("exam_prep_topics")
    .select("label, contradictions")
    .eq("exam_prep_id", prepId);
  if (error || !data) return {};
  const warnings: Record<string, string> = {};
  for (const row of data as { label?: string; contradictions?: unknown }[]) {
    const label = String(row.label ?? "").trim();
    const items = Array.isArray(row.contradictions)
      ? row.contradictions.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const concept = String((item as TopicContradiction).concept ?? "").trim();
          const claims = Array.isArray((item as TopicContradiction).claims)
            ? (item as TopicContradiction).claims.filter(
                (claim) => claim && typeof claim.value === "string",
              )
            : [];
          return concept && claims.length ? [{ concept, claims }] : [];
        })
      : [];
    const text = formatContradictions(items);
    if (label && text) warnings[label] = text;
  }
  return warnings;
}

/** Ana select'in sütunları (göçten önce de var olanlar). */
const PREP_COLUMNS =
  "id, title, exam_type, study_plan_id, exam_date, created_at, active_topic_id, intro_completed_at, intro_deferred_at, schedule_v2, learning_tracking, target_score, daily_minutes, study_days, hard_topics_self, learning_preferences";

type PrepSourceRow = { document_id?: string | null; source_document_ids?: unknown } | null;
type PrepShareRow = { visibility?: string | null; view_count?: number | null; forked_from?: string | null } | null;

export default async function ExamPrepDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ prepId: string }>;
  searchParams: Promise<{ kilitli?: string }>;
}) {
  const { prepId } = await params;
  // Kilitli adımın adresi açıldıysa o adım seçili gelir (düğüm sayfası buraya yönlendirir).
  const { kilitli } = await searchParams;
  const { supabase, user } = await requireStudentArea();
  const service = createServiceClient();

  // Dalga 1 (6 Kasım 2026, hız paketi): kabuk, anahtar, hazırlık ve profil birbirini beklemez.
  // Hazırlık tek select'le okunur: kaynak belge (document_id, source_document_ids) ve paylaşım
  // (visibility, view_count, forked_from) sütunları canlıda var. Birleşik okuma hata verirse
  // (sütun yok: göçten önceki veritabanı) eski üç okumaya düşülür: önce ana select, sonra kaynak
  // (yoksa yalnız document_id) ve paylaşım ayrı ayrı; eksik sütun sayfayı 404'e düşürmez.
  const [shell, trackingV2, mergedPrep, { data: profile }] = await Promise.all([
    loadParityShellProps(supabase, user.id, user.email),
    isFeatureEnabled(service, PDF_LEARNING_V2_FLAG),
    supabase
      .from("exam_preps")
      .select(
        "id, title, exam_type, study_plan_id, exam_date, created_at, active_topic_id, intro_completed_at, intro_deferred_at, schedule_v2, learning_tracking, target_score, daily_minutes, study_days, hard_topics_self, learning_preferences, document_id, source_document_ids, visibility, view_count, forked_from",
      )
      .eq("id", prepId)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("profiles").select("school_id, school_name").eq("id", user.id).maybeSingle(),
  ]);

  let prepRead = mergedPrep.data;
  let prepSource: PrepSourceRow = mergedPrep.data;
  let shareRow: PrepShareRow = mergedPrep.data;
  if (mergedPrep.error) {
    const { data: basePrep } = await supabase
      .from("exam_preps")
      .select(PREP_COLUMNS)
      .eq("id", prepId)
      .eq("user_id", user.id)
      .maybeSingle();
    // Ek sütunlar yalnız kaynak/paylaşım okumalarından gelir; hazırlık nesnesinde boş durur.
    prepRead = basePrep
      ? { ...basePrep, document_id: null, source_document_ids: null, visibility: null, view_count: null, forked_from: null }
      : null;
    if (basePrep) {
      const [richSource, shareRead] = await Promise.all([
        supabase.from("exam_preps").select("document_id, source_document_ids").eq("id", prepId).maybeSingle(),
        supabase.from("exam_preps").select("visibility, view_count, forked_from").eq("id", prepId).maybeSingle(),
      ]);
      prepSource = richSource.error
        ? (
            await supabase
              .from("exam_preps")
              .select("document_id")
              .eq("id", prepId)
              .maybeSingle()
          ).data
        : richSource.data;
      shareRow = shareRead.data;
    }
  }

  const prep = prepRead;
  if (!prep) notFound();

  // "Sıradaki" hazır değilse arka planda yazılır (18 Ekim 2026, ürün sahibinin kararı): öğrenci
  // hazırlığına her döndüğünde yolu bir adım önden hazır. Kayıt ya da yazım varsa atlanır.
  if (trackingV2) {
    const head = await headers();
    const host = head.get("x-forwarded-host") ?? head.get("host");
    const proto = head.get("x-forwarded-proto") ?? "https";
    if (host) after(() => requestPrepPrefetch(service, { origin: `${proto}://${host}`, userId: user.id, prepId }));
  }
  // Soğuk bellek (5 Kasım 2026): bu hazırlığın gömmeleri tahliye edildiyse arka planda yeniden indekslenir (yalnız gömme çağrısı).
  after(() => reindexEvictedForPrep(service, prepId, embedTexts).catch(() => 0));

  const rawSourceIds = prepSource?.source_document_ids;
  const sourceIds = prepSourceDocumentIds({
    documentId: (prepSource?.document_id as string | null) ?? null,
    sourceDocumentIds: Array.isArray(rawSourceIds)
      ? rawSourceIds.filter((id): id is string => typeof id === "string")
      : [],
  });
  const forkedFrom = shareRow?.forked_from ?? null;

  // Dalga 2: hazırlığa bağlı okumalar aynı anda. Yol düğümlerinin yazımı (ensure*) kendi sırasıyla ve
  // sunucu anahtarıyla (6 Kasım 2026): öğrenci rolünün yol tablolarına yazma izni kapandı. Hazırlık
  // yukarıda sahibine göre okundu. Düğüm okuması yazımdan sonra.
  const [
    { data: sourceRows },
    creatorLabel,
    prepTopics,
    { data: nodeRows },
    skipKinds,
    { data: masteryRows },
    openCount,
    [{ data: attemptRows }, { data: gapRows }, { data: openMissRows }],
    topicWarnings,
  ] = await Promise.all([
    sourceIds.length
      ? supabase
          .from("documents")
          // `*`: hızlı başlatmanın part_of sütunu göçten önce de okunur.
          .select("*")
          .in("id", sourceIds)
          .eq("user_id", user.id)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] as { id: string; file_name: string; mime_type: string | null; page_count: number | null }[] }),
    // Okuldan katılınan hazırlıkta "Oluşturan" asıl sahibin ilk adı. Başkasının
    // profili RLS'e takıldığı için servis anahtarıyla, yalnız ad okunur.
    (async () => {
      if (!forkedFrom) return "Sen";
      const { data: source } = await service.from("exam_preps").select("user_id").eq("id", forkedFrom).maybeSingle();
      const { data: owner } = source?.user_id
        ? await service.from("profiles").select("full_name").eq("id", source.user_id as string).maybeSingle()
        : { data: null };
      return String(owner?.full_name ?? "").trim().split(/\s+/)[0] || "Okul arkadaşın";
    })(),
    loadOrBackfillTopics(supabase, prep.id, prep.study_plan_id),
    (async () => {
      await ensurePrepNodes(service, prep);
      await ensurePathSkeletonNodes(service, prep.id);
      return supabase
        .from("exam_prep_nodes")
        .select("id, kind, title, day_index, sort_order, status, session_meta")
        .eq("exam_prep_id", prepId)
        .order("sort_order");
    })(),
    pathSkipKinds(service, user.id),
    trackingV2
      ? supabase
          .from("exam_prep_topic_mastery")
          .select(
            "topic_key, measured_level, confidence, evidence_count, first_attempt_correct, first_attempt_total, independent_correct, independent_total, last_practiced_at",
          )
          .eq("exam_prep_id", prepId)
      : Promise.resolve({ data: null }),
    // Yalnız çözülmemiş yanılgılar (20 Ekim 2026); sütun yoksa hepsi açık sayılır.
    trackingV2 ? countOpenMisconceptions(supabase, { prepId }) : Promise.resolve(0),
    // İlerleme sekmesi (kıyas ürünü düzeni): haftalık tablo, tempo, denemeler ve
    // bilgi eksikleri gerçek kayıtlardan. Tahmin uydurulmuyor; kayıt yoksa
    // bölüm "ilk derslerinden sonra görünür" diyor.
    Promise.all([
      supabase
        .from("exam_prep_node_attempts")
        .select("node_id, score, total, created_at, payload, topic_id")
        .eq("exam_prep_id", prepId)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(500),
      withOpenMisconceptions((onlyOpen) => {
        const query = supabase
          .from("exam_prep_misconceptions")
          .select("claim, topic_label, question_preview, source_kind")
          .eq("exam_prep_id", prepId);
        return (onlyOpen ? query.is("resolved_at", null) : query)
          .order("created_at", { ascending: false })
          .limit(5);
      }),
      // Final adımlarının konusu için açık yanlışların konusu (Paket I #8, `finalStepTopic`).
      trackingV2
        ? withOpenMisconceptions((onlyOpen) => {
            const query = supabase.from("exam_prep_misconceptions").select("topic_label").eq("exam_prep_id", prepId);
            return (onlyOpen ? query.is("resolved_at", null) : query).limit(300);
          })
        : Promise.resolve({ data: [] as { topic_label: string | null }[] }),
    ]),
    loadTopicWarnings(supabase, prepId),
  ]);

  const sourceById = new Map((sourceRows ?? []).map((row) => [row.id as string, row]));
  const parentOf = (row: unknown) =>
    typeof (row as { part_of?: unknown }).part_of === "string" ? (row as { part_of: string }).part_of : null;
  // Pencereli işleme (31 Ekim 2026): büyük kitabın parçaları (baş kopyası + pencereler) tek kaynak olarak görünür;
  // sayfa sayısı hazırlıktaki parçaların toplamı.
  const pagesByParent = new Map<string, number>();
  for (const row of sourceRows ?? []) {
    const parent = parentOf(row);
    if (parent) pagesByParent.set(parent, (pagesByParent.get(parent) ?? 0) + (typeof row.page_count === "number" ? row.page_count : 0));
  }
  const shownParents = new Set<string>();
  const materials = sourceIds.flatMap((id) => {
    const row = sourceById.get(id);
    if (!row) return [];
    // Hızlı başlatmanın baş kopyası (document-head.ts): ana belge de hazırlıktaysa bir kez görünür; bağlantı ana belgeye.
    const parent = parentOf(row);
    if (parent && sourceById.has(parent)) return [];
    if (parent && shownParents.has(parent)) return [];
    if (parent) shownParents.add(parent);
    return [
      {
        id,
        name: (row.file_name as string) || "Belge",
        kindLabel: materialKindLabel({
          mimeType: row.mime_type as string | null,
          pageCount: parent ? pagesByParent.get(parent) ?? null : typeof row.page_count === "number" ? row.page_count : null,
        }),
        href: `/dokumanlar/${parent ?? id}`,
      },
    ];
  });
  const sourceDoc = prepSource?.document_id
    ? sourceById.get(prepSource.document_id as string) ?? null
    : materials[0]
      ? { id: materials[0].id, file_name: materials[0].name }
      : null;

  const topicsMeter = topicProgress(prepTopics);

  const nodeList = (nodeRows ?? []).map((row) => ({
    id: row.id as string,
    kind: row.kind as PlanNodeKind,
    title: row.title as string,
    dayIndex: row.day_index as number,
    sortOrder: row.sort_order as number,
    status: row.status as "locked" | "ready" | "done",
    sessionMeta:
      row.session_meta && typeof row.session_meta === "object"
        ? (row.session_meta as {
            objective?: string;
            sourcePages?: number[];
            durationMinutes?: number;
            activityMinutes?: number;
            role?: string;
            calendarDate?: string;
            topicId?: string;
            topicTitle?: string;
          })
        : null,
  }));

  // Ücretsiz hesapta Plus'a özel adım "Sıradaki" olmaz: açamaz (24 Ekim 2026, `pathSkipKinds`). Düzeltmeden
  // önce Plus adımında takılmış yol bir kez açılır (`freePathUnblockIds`, tamamlama fonksiyonunun kuralı).
  const unblock = freePathUnblockIds(nodeList, skipKinds);
  const opened = new Set(unblock);
  const nodes = nodeList.map((node) =>
    opened.has(node.id) && node.status === "locked" ? { ...node, status: "ready" as const } : node,
  );
  // kıyas ürünü: yeni hazırlıkta "Devam et" ilk dersi doğrudan açar (3 Ekim 2026).
  // Eskiden önce "Konu seç", sonra zorunlu 8 soruluk tanı geliyordu. Etkin
  // konu yoksa ilk konu etkin olur; tanı yolun başında isteğe bağlı düğümdür.
  let activeTopicId = (prep.active_topic_id as string | null) ?? null;
  const needsActiveTopic = !activeTopicId && prepTopics.length > 0;
  if (needsActiveTopic) activeTopicId = prepTopics[0].id;

  // Etkin konunun adı konu listesinden (ayrı okuma yok); listede yoksa (eski kayıt) bir kez okunur.
  const listedActiveTopic = activeTopicId ? prepTopics.find((topic) => topic.id === activeTopicId) : undefined;
  // Deneme puanı ilerleme kayıtlarından: adımın en son tamamlanan kaydı (kayıtlar yeniden eskiye sıralı).
  const mockNode = trackingV2 ? nodes.find((n) => n.kind === "written_exam" && n.status === "done") : undefined;
  const listedMockAttempt = mockNode ? (attemptRows ?? []).find((row) => row.node_id === mockNode.id) : undefined;

  // Dalga 3: yazımlar ve (gerekirse) yedek okumalar aynı anda.
  const [, , activeTopicRead, mockAttempt] = await Promise.all([
    unblock.length
      ? service
          .from("exam_prep_nodes")
          .update({ status: "ready" })
          .eq("exam_prep_id", prep.id)
          .eq("status", "locked")
          .in("id", unblock)
          .then(({ error: unblockError }) => {
            if (unblockError) console.warn("free_path_unblock_failed", { code: unblockError.code });
          })
      : Promise.resolve(),
    needsActiveTopic
      ? service.from("exam_preps").update({ active_topic_id: activeTopicId }).eq("id", prep.id).eq("user_id", user.id)
      : Promise.resolve(),
    activeTopicId && !listedActiveTopic
      ? supabase
          .from("exam_prep_topics")
          .select("label")
          .eq("id", activeTopicId)
          .maybeSingle()
          .then(({ data }) => data as { label?: string | null } | null)
      : Promise.resolve(null),
    mockNode && !listedMockAttempt
      ? supabase
          .from("exam_prep_node_attempts")
          .select("score, total")
          .eq("node_id", mockNode.id)
          .eq("status", "completed")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
          .then(({ data }) => data as { score?: number | null; total?: number | null } | null)
      : Promise.resolve(listedMockAttempt ?? null),
  ]);

  // Tamamlama tek işlevden (Paket I #7, prep-metrics.ts): "Hazırsın" karar ekranı adım sayılmaz.
  const progress = pathCompletion(nodes);
  let ready = nodes.find((node) => node.status === "ready" && !skipKinds.has(node.kind));
  const hasTopic = Boolean(activeTopicId);
  const needsIntro = false;

  let learningTrackingView = null as LearningTrackingView | null;
  let masterySnapshots: TopicMasterySnapshot[] = [];

  let openMisconceptions = 0;
  let openMisconceptionsKnown = true;

  if (trackingV2) {
    openMisconceptions = openCount ?? 0;
    openMisconceptionsKnown = openCount != null;

    masterySnapshots = (masteryRows ?? []).map((row) => ({
      topicKey: row.topic_key as string,
      measured: Number(row.evidence_count ?? 0) > 0,
      level: row.measured_level as TopicMasterySnapshot["level"],
      confidence: Number(row.confidence ?? 0),
      evidenceCount: Number(row.evidence_count ?? 0),
      firstAttemptCorrect: Number(row.first_attempt_correct ?? 0),
      firstAttemptTotal: Number(row.first_attempt_total ?? 0),
      independentCorrect: Number(row.independent_correct ?? 0),
      independentTotal: Number(row.independent_total ?? 0),
      lastPracticedAt: (row.last_practiced_at as string | null) ?? null,
    }));
    const topics = masterySnapshots;

    // Planlanan konular konu listesinden (ayrı exam_prep_topics okuması yok).
    const plannedTopicKeys = prepTopics
      .map((t) => String(t.label ?? "").trim())
      .filter(Boolean);

    let mockScorePct: number | null = null;
    if (mockAttempt?.total) {
      mockScorePct = Math.round(
        (Number(mockAttempt.score ?? 0) / Number(mockAttempt.total)) * 100,
      );
    }

    const indicators = buildLearningIndicators({
      nodes,
      topics,
      plannedTopicKeys,
      mockScorePct,
      targetScore: typeof prep.target_score === "number" ? prep.target_score : null,
      openMisconceptions,
      openMisconceptionsKnown,
    });

    learningTrackingView = {
      programProgressPct: indicators.programProgress.pct,
      programLabel: indicators.programProgress.label,
      topicMasteryPct: indicators.topicMastery.pct,
      topicMasteryLabel: indicators.topicMastery.label,
      measuredTopicCount: indicators.topicMastery.measuredCount,
      unmeasuredTopicCount: indicators.topicMastery.unmeasuredCount,
      examReadinessPct: indicators.examReadiness.pct,
      examReadinessLabel: indicators.examReadiness.label,
      claimFullyReady: indicators.examReadiness.claimFullyReady,
      coveragePct: indicators.examReadiness.components.coveragePct,
      measuredSuccessPct: indicators.examReadiness.components.measuredSuccessPct,
      mockPct: indicators.examReadiness.components.mockPct,
      retentionPct: retentionFromTopics(topics),
    };

    const biased = preferNextNodeForTracking(nodes, {
      openMisconceptions,
      weakOrStaleTopicKeys: weakOrStaleTopicKeys(topics),
      skipKinds,
    });
    if (biased) ready = biased;
  }

  // kıyas ürünü yolun üstünde son biten etkinliği yüzdesiyle gösteriyor ("30% · PODCAST · Sonuçları gör").
  const lastAttempt = (attemptRows ?? []).find((row) => typeof row.node_id === "string");
  const lastResult = lastAttempt
    ? {
        nodeId: lastAttempt.node_id as string,
        pct:
          typeof lastAttempt.score === "number" && typeof lastAttempt.total === "number" && lastAttempt.total > 0
            ? Math.round((lastAttempt.score / lastAttempt.total) * 100)
            : null,
      }
    : null;
  // kıyas ürünü yolda biten her adımın yüzdesini yazıyor ("30% Podcast"): adımın son bitişi. Tek
  // öğeli bitiş (sorusuz podcast 1/1) puan sayılmaz, yüzde yazılmaz.
  // Biten adımın bitiş günü (30 Ekim 2026): yol "Yarın" değil "Tamamlandı · 29 Eki" yazar. Kayıtlar
  // yeniden eskiye sıralı; adımın son bitişi alınır.
  const nodeDoneOn: Record<string, string> = {};
  for (const row of attemptRows ?? []) {
    const id = typeof row.node_id === "string" ? row.node_id : null;
    if (!id || id in nodeDoneOn || typeof row.created_at !== "string") continue;
    const at = new Date(row.created_at);
    if (!Number.isNaN(at.getTime())) nodeDoneOn[id] = istanbulDay(at);
  }
  const nodeScores: Record<string, number> = {};
  for (const row of attemptRows ?? []) {
    const id = typeof row.node_id === "string" ? row.node_id : null;
    if (!id || id in nodeScores) continue;
    if (typeof row.score === "number" && typeof row.total === "number" && row.total > 1) {
      nodeScores[id] = Math.round((row.score / row.total) * 100);
    }
  }
  const topicLabels = prepTopics.map((topic) => topic.label);
  // Konunun yüzdesi, durumu ve "N çözüldü" kanıttan ve tek eşleştiriciyle (30 Ekim 2026, `masteryByPlannedTopic`):
  // hâkimiyet satırı konuya adıyla bağlanır, ad varyantı aynı konuya toplanır. Önceden yalnız birebir anahtar
  // okunuyor, "çözüldü" ise düğümün başlığına göre etkinlik kayıtlarından sayılıyordu (kanıt değil).
  const targetScore = typeof prep.target_score === "number" ? prep.target_score : null;
  const masteryByTopic = masteryByPlannedTopic(topicLabels, masterySnapshots);
  const masteryViews = new Map(
    topicLabels.map((label) => {
      const snapshot = masteryByTopic.get(label);
      return [label, snapshot ? topicMasteryView(snapshot, targetScore) : null] as const;
    }),
  );
  // Yol bölümü yalnız ölçülmüş konunun yüzdesini yazar (Paket I #7): ölçülmemiş konu (3 cevaptan az) sayı göstermez.
  const topicPercents: Record<string, number> = {};
  for (const label of topicLabels) {
    const view = masteryViews.get(label);
    if (!view || view.state === "unmeasured") continue;
    topicPercents[label.trim().toLocaleLowerCase("tr-TR")] = view.percent;
  }
  const progressView = buildPrepProgressView({
    nodes,
    attempts: (attemptRows ?? []).map((row) => ({
      nodeId: row.node_id as string,
      score: typeof row.score === "number" ? row.score : null,
      total: typeof row.total === "number" ? row.total : null,
      createdAt: row.created_at as string,
      solved: solvedQuestions(row.payload),
      ...attemptTopicFields(row),
    })),
    topicLabels,
    topicRefs: prepTopics.map((topic) => ({
      id: topic.id,
      label: topic.label,
      documentTopicNodeId: topic.documentTopicNodeId ?? null,
    })),
    topicMastery: topicLabels.map((label) => {
      const view = masteryViews.get(label);
      return {
        label,
        confidence: view && view.state !== "unmeasured" ? view.percent : 0,
        state: view?.state ?? "unmeasured",
        // Kanıt yalnız ölçüm açıkken var; kapalı eski yolda "çözüldü" kayıtlardan sayılır.
        ...(trackingV2 ? { solved: view?.solved ?? 0 } : {}),
      };
    }),
    gaps: (gapRows ?? []).map((row) => ({
      claim: String(row.claim ?? ""),
      topicLabel: (row.topic_label as string | null) ?? null,
      detail: (row.question_preview as string | null) ?? null,
      sourceKind: (row as { source_kind?: string | null }).source_kind ?? null,
    })),
    examDate: (prep.exam_date as string | null) ?? null,
    targetScore: typeof prep.target_score === "number" ? prep.target_score : null,
    dailyMinutes: typeof prep.daily_minutes === "number" ? prep.daily_minutes : null,
    measuredReadinessPct: learningTrackingView?.examReadinessPct ?? null,
  });

  // Yol kartında final adımının konusu (30 Ekim 2026, Paket I #8): açılışta sunucunun seçeceği konuyla aynı
  // seçici (`finalStepTopic`). Önceden kart devralınan 1. konuyu yazıyor, oturum başka konuyu soruyordu.
  // Yalnız görünüm: kayıt değişmez; açılışta rota konuyu kayda yazar.
  const finalRanked = trackingV2
    ? rankFinalStepTopics({
        plannedTopics: topicLabels,
        mastery: masterySnapshots,
        openMisses: ((openMissRows ?? []) as { topic_label?: string | null }[]).map((row) => ({
          topicLabel: row.topic_label ?? null,
        })),
        targetScore: typeof prep.target_score === "number" ? prep.target_score : null,
      }).map((row) => row.label)
    : null;
  const homeNodes = finalRanked
    ? nodes.map((node) => {
        const meta = (node.sessionMeta ?? {}) as Record<string, unknown>;
        const ownTopic = meta.adaptive === "low" || typeof meta.checkpoint === "string";
        if (node.status === "done" || ownTopic || !PREP_WIDE_TARGET_KINDS.has(node.kind)) return node;
        const target = prepWideTargetTopic({
          kind: node.kind,
          requestedTopic: "",
          adaptiveFocus: null,
          practiceTopics: finalRanked,
          mastery: masterySnapshots,
          plannedTopics: topicLabels,
        });
        return target ? { ...node, sessionMeta: { ...(node.sessionMeta ?? {}), topicTitle: target } } : node;
      })
    : nodes;

  const startHref = !hasTopic
    ? examPrepTopicHref(prepId)
    : needsIntro
      ? examPrepIntroHref(prepId)
      : ready
        ? examPrepNodeHref(prepId, ready.id)
        : examPrepHomeHref(prepId);

  // Etkin konunun adı konu listesinden; listede yoksa dalga 3'teki tek okumadan.
  const topicLabel: string | null = activeTopicId
    ? (listedActiveTopic?.label ?? activeTopicRead?.label ?? null)
    : null;

  const scheduleV2 =
    prep.schedule_v2 && typeof prep.schedule_v2 === "object"
      ? (prep.schedule_v2 as {
          summary?: string;
          fits?: boolean;
          optionsIfTight?: string[];
        })
      : null;

  const settings = trackingV2
    ? {
        examDate: (prep.exam_date as string | null) ?? null,
        dailyMinutes: prepDailyMinutes(prep.daily_minutes),
        studyDays: prepStudyDays(prep.study_days),
        hardTopics: Array.isArray(prep.hard_topics_self)
          ? (prep.hard_topics_self as string[])
          : [],
        // Konu seçenekleri konu listesinden (ayrı exam_prep_topics okuması yok).
        topicOptions: prepTopics
          .map((t) => String(t.label ?? "").trim())
          .filter(Boolean),
        preferences: parseLearningPreferences(prep.learning_preferences),
        scheduleFits:
          typeof scheduleV2?.fits === "boolean" ? scheduleV2.fits : null,
        optionsIfTight: Array.isArray(scheduleV2?.optionsIfTight)
          ? scheduleV2!.optionsIfTight!
          : [],
      }
    : null;

  // Paket J3 #14 (31 Ekim 2026): sınıf davet bağlantısı sunucuda imzalanır ve mutlak adresle gider (WhatsApp metnine
  // göreli adres girmez). Sınav günü geçince not sorusu / başarı kartı; not göçsüz `learning_preferences`'ta.
  const inviteToken = createPrepInviteToken(prep.id as string);
  const inviteUrl = inviteToken ? prepInviteUrl(inviteToken) : null;
  const resultPrefs = parseLearningPreferences(prep.learning_preferences);
  const resultToday = istanbulDay();
  const examPassed = examDatePassed(prep.exam_date as string | null, resultToday);
  // Kaydedilmiş notun başlangıcı boşsa (eski kural ya da sonradan gelen kayıt) okurken yeniden hesaplanır (Paket J takip #2).
  const storedResult = resultPrefs.examResult;

  // Dalga 4: kilit + havuz önizlemesi, sınav sonrası başlangıç, ünite kontrolü, hakimiyet haritası ve kamp kartı
  // birbirini beklemez (kilit, dalga 3'teki yol açma yazımından sonra okunur).
  const [{ firstTopicLocks, lockedIds, previewNode, lessonPreview }, lateBaseline, unitCheck, { mapUnits, prepNet }, camp] =
    await Promise.all([
      (async () => {
        // Beklemesiz kilit (Paket J takip #1): ücretsiz hesapta kilitli adım yolda 🔒 rozeti taşır, tıklayınca kart anında
        // açılır. Karar adım sayfası ve başlatma isteğiyle aynı kuraldan (`freeTopicLocks`); okuma düşerse kilit yok.
        const firstTopicLocks = await freeTopicLocks(service, {
          userId: user.id,
          prepId,
          nodes: nodes
            .filter((node) => node.status !== "done")
            .map((node) => ({
              id: node.id,
              kind: node.kind,
              sessionMeta: node.sessionMeta ?? null,
              topicLabel: String((node.sessionMeta as { topicTitle?: string } | undefined)?.topicTitle ?? "") || String(prep.title ?? "") || "konu",
            })),
        }).catch(() => null);
        const lockedIds = new Set(firstTopicLocks?.lockedIds ?? []);
        // Anında havuz dersi (3 Kasım 2026): sıradaki açık ders düğümünün havuzdaki ilk ekranı; kilitli konuya önizleme yok.
        const previewNode = ready && ready.kind === "lesson" && !lockedIds.has(ready.id) ? ready : null;
        const previewTopic = previewNode
          ? String((previewNode.sessionMeta as { topicTitle?: string } | undefined)?.topicTitle ?? "").trim()
          : "";
        // Konusu düğümde yazılı değilse (açılışta etkin konuya bağlanır) önizleme yok; yanlış konu metni gösterilmez.
        const lessonPreview = previewNode && previewTopic
          ? await poolLessonPreview(service, { prefs: prep.learning_preferences, topicLabel: previewTopic, title: previewNode.title ?? previewTopic }).catch(() => null)
          : null;
        return { firstTopicLocks, lockedIds, previewNode, lessonPreview };
      })(),
      examPassed && storedResult && storedResult.baselinePct == null
        ? loadExamBaseline(service, { prepId: prep.id as string, userId: user.id })
        : Promise.resolve(null),
      // Plan PR 3: etkin ünite için Ünite Seviye Kontrolü (havuzda ≥3 doğrulanmış soru varsa; tablolar yoksa gösterilmez).
      unitCheckOffer(service, {
        userId: user.id,
        prepId: prep.id as string,
        prefs: prep.learning_preferences,
        topicLabel,
      }),
      // Plan PR 4: resmî kurulumdan hazırlıkta Hakimiyet Haritası + Kişisel Program (tablolar yoksa gösterilmez).
      (async () => {
        const mapUnits = await loadMapInputs(service, { userId: user.id, prefs: prep.learning_preferences });
        const prepNet = mapUnits?.length
          ? await prepNetEstimate(service, { userId: user.id, prepId: prep.id as string, prefs: prep.learning_preferences, mapUnits })
          : null;
        return { mapUnits, prepNet };
      })(),
      // Paket 5: sınava ≤ 7 gün — ücretsiz hesapta mevcut Plus Haftalık'a sakin yönlendirme (Plus'ta gizli).
      prep.exam_date && !examPassed
        ? Promise.all([getUserEntitlements(service, user.id), loadPlusPrices(service)])
            .then(([ent, prices]) =>
              campOffer({ daysLeft: daysUntilExam(prep.exam_date as string), examPassed, showsUpgradeChrome: ent.showsUpgradeChrome, weeklyKurus: prices.plusWeekly }),
            )
            .catch(() => null)
        : Promise.resolve(null),
    ]);
  const pathNodes = lockedIds.size
    ? homeNodes.map((node) => (lockedIds.has(node.id) ? { ...node, planLocked: true } : node))
    : homeNodes;

  const examResultView = examPassed
    ? {
        prepId: prep.id as string,
        due: examResultDue({
          examDate: prep.exam_date as string | null,
          today: resultToday,
          result: resultPrefs.examResult ?? null,
          snoozedUntil: resultPrefs.examResultSnoozedUntil ?? null,
        }),
        stored: storedResult
          ? {
              score: storedResult.score,
              baselinePct: storedResult.baselinePct ?? lateBaseline?.pct ?? null,
              baselineSource: storedResult.baselinePct != null ? storedResult.baselineSource : (lateBaseline?.source ?? null),
            }
          : null,
        landingUrl: `${appOrigin()}/`,
      }
    : null;

  return (
    <ParitySorShell {...shell} chrome="focus" backHref="/deneme-sinavlari" minimalTop>
      {camp ? (
        <div style={{ width: "min(40rem, 100%)", margin: "0 auto", padding: "0 1rem" }}>
          <CampCard offer={camp} />
        </div>
      ) : null}
      {unitCheck ? (
        <div style={{ width: "min(40rem, 100%)", margin: "0 auto", padding: "0 1rem" }}>
          <UnitLevelCheck prepId={prep.id as string} unitId={unitCheck.unitId} unitTitle={unitCheck.unitTitle} />
        </div>
      ) : null}
      {mapUnits?.length ? (
        <div style={{ width: "min(40rem, 100%)", margin: "0 auto", padding: "0 1rem" }}>
          <MasteryMap
            prepId={prep.id as string}
            units={mapUnits}
            daysLeft={prep.exam_date ? (examPassed ? 0 : daysUntilExam(prep.exam_date as string)) : null}
            dailyMinutes={typeof prep.daily_minutes === "number" ? prepDailyMinutes(prep.daily_minutes) : null}
            net={prepNet ?? undefined}
          />
        </div>
      ) : null}
      <ExamPrepHome
        prepId={prep.id}
        officialNote={officialPlanNote(prep.learning_preferences) ?? officialSourceNote(readCurriculumRef(prep.learning_preferences))}
        shareTools={{
          inviteUrl,
          whatsappHref: inviteUrl ? prepInviteWhatsappHref((prep.title ?? prep.exam_type) as string | null, inviteUrl) : null,
        }}
        examResult={examResultView}
        title={prep.title ?? prep.exam_type}
        examType={prep.exam_type}
        examDate={prep.exam_date}
        daysLabel={prep.exam_date ? `${daysUntilExam(prep.exam_date)} gün kaldı` : ""}
        progressPct={progress.pct}
        nodes={pathNodes}
        lessonPreview={lessonPreview && previewNode ? { nodeId: previewNode.id, preview: lessonPreview } : null}
        firstTopicLock={firstTopicLocks?.summary ?? null}
        hasTopic={hasTopic}
        activeTopicLabel={topicLabel}
        needsIntro={needsIntro}
        introPending={shouldShowLevelNode(
          prep.intro_completed_at as string | null,
          nodes,
          prep.intro_deferred_at as string | null,
        )}
        createdAt={(prep.created_at as string | null) ?? null}
        examTime={examTimeFromPreferences(prep.learning_preferences).time}
        examPlace={examTimeFromPreferences(prep.learning_preferences).place}
        nodeDoneOn={nodeDoneOn}
        startHref={startHref}
        canShare={Boolean(profile?.school_id)}
        initialShared={shareRow?.visibility === "school"}
        scheduleSummary={scheduleV2?.summary ?? null}
        learningTracking={learningTrackingView}
        uiV2={trackingV2}
        openMisconceptions={openMisconceptions}
        settings={settings}
        documentId={sourceDoc?.id ?? null}
        documentName={sourceDoc?.file_name ?? null}
        topicsDone={topicsMeter.done}
        topicCount={topicsMeter.total}
        topicLabels={prepTopics.map((topic) => topic.label)}
        topicOptions={prepTopics
          .filter((topic) => topic.id && topic.label)
          .map((topic) => ({ id: topic.id, label: topic.label, documentTopicNodeId: topic.documentTopicNodeId ?? null }))}
        materials={materials}
        readinessClaim={learningTrackingView?.claimFullyReady ?? null}
        topicWarnings={topicWarnings}
        progressView={progressView}
        targetScore={typeof prep.target_score === "number" ? prep.target_score : null}
        creatorLabel={creatorLabel}
        schoolName={(profile as { school_name?: string | null } | null)?.school_name ?? null}
        joinedFromSchool={Boolean(forkedFrom)}
        joinCount={Number((shareRow as { view_count?: number } | null)?.view_count ?? 0)}
        lastResult={lastResult}
        nodeScores={nodeScores}
        topicPercents={topicPercents}
        lockedPickId={typeof kilitli === "string" ? kilitli : null}
        pendingMaterials={await countPendingMaterials(service, { prepId, userId: user.id })}
        dueReviews={await dueReviewCountForPrep(service, {
          userId: user.id,
          prepId,
          examDate: (prep.exam_date as string | null) ?? null,
        })}
      />
    </ParitySorShell>
  );
}
