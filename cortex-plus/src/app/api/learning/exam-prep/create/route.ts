import { NextResponse, after } from "next/server";
import { requestPrepPrefetch } from "@/lib/learning/lesson-prefetch";
import { recordPendingMaterials } from "@/lib/learning/pending-materials";
import { requestPendingAdvance } from "@/lib/learning/pending-windows";
import { ensureTeacherAnalyses, loadPrepDocumentIds, TEACHER_ANALYSIS_WAIT_MS } from "@/lib/documents/teacher-analysis-run";
import { z } from "zod";
import { PREP_DOCUMENT_REQUEST_MAX } from "@/lib/learning/prep-topic-list";
import { errorResponse, withUser } from "@/lib/api/guards";
import { invalidInputResponse, lenientText } from "@/lib/api/input-fields";
import { isFeatureEnabled, PDF_LEARNING_V2_FLAG } from "@/lib/admin/feature-flags";
import {
  daysUntilExam,
  mergeStudyPathTemplate,
  sessionMetaBySortOrder,
} from "@/lib/learning/exam-prep-plan";
import { insertExamPrepGraph } from "@/lib/learning/exam-prep-insert";
import {
  FREE_PREP_LIMIT_CODE,
  FREE_PREP_LIMIT_MESSAGE,
  freePrepLimitReached,
} from "@/lib/billing/free-prep-limit";
import { alignNewSessionSortOrders } from "@/lib/learning/exam-prep-reschedule-apply";
import {
  buildExamScheduleV2,
  prepDailyMinutes,
  prepStudyDays,
  scheduleSessionsToNodeDrafts,
  type ScheduleTopicInput,
} from "@/lib/learning/exam-schedule-v2";
import { applyStudentTopicList } from "@/lib/learning/apply-prep-topics";
import { remapTopicIds, topicIdMap, topicOnlyScheduleTopics } from "@/lib/learning/topic-only-schedule";
import { groundPrepTopics } from "@/lib/learning/ground-prep-topics";
import { missingColumn } from "@/lib/learning/missing-column";
import {
  contradictionsByTopicTitleResolved,
  readContradictionDocuments,
} from "@/lib/learning/prep-contradiction-read";
import { orderedSourceDocumentIds } from "@/lib/learning/prep-source";
import { PREP_TOPIC_CAP } from "@/lib/learning/prep-topic-list";
import { loadScheduleTopics } from "@/lib/learning/prep-schedule-topics";
import { loadScheduleCheckpoints } from "@/lib/learning/schedule-checkpoints";
import { EXAM_PLACE_MAX, EXAM_TIME_PATTERN } from "@/lib/learning/exam-time";
import type { TopicContradiction } from "@/lib/learning/source-contradictions";
import type { TopicSourceRef } from "@/lib/learning/topic-merge";
import { orderTopicsForPath } from "@/lib/learning/topic-order";
import { documentRunningHeaders } from "@/lib/documents/clean-pages";
import { isRunningHeader } from "@/lib/documents/clean-text";
import { isJunkTopicTitle } from "@/lib/documents/topic-title";
import { getProgram } from "@/lib/curriculum/registry";
import { orderOfficialUnits, type OrderableUnit } from "@/lib/curriculum/official-plan-order";
import { verifyPlannedUnits } from "@/lib/curriculum/official-setup";
import { runPool } from "@/lib/documents/upload-batch";

/** Kurulumdaki bağımsız satır güncellemeleri için eşzamanlı istek sınırı. */
const WRITE_LANES = 16;

/** Kayıtta olmayan program başvurusu saklanmaz (eski istemci / bozuk istek). */
function withKnownCurriculum<T extends { curriculum?: { programId: string } } | undefined>(prefs: T) {
  if (!prefs) return {};
  if (prefs.curriculum && !getProgram(prefs.curriculum.programId)) {
    const { curriculum: _drop, ...rest } = prefs;
    void _drop;
    return rest;
  }
  return prefs;
}

const prefsSchema = z
  .object({
    style: z.enum(["examples", "theory", "mixed"]).optional(),
    pace: z.enum(["slow", "normal", "fast"]).optional(),
    notes: z.string().max(400).optional(),
    modality: z
      .enum(["reading", "listening", "watching", "practice", "auto"])
      .optional(),
    modalities: z.array(z.enum(["reading", "listening", "watching", "practice"])).max(4).optional(),
    language: z.enum(["tr", "en"]).optional(),
    examTrack: z.enum(["tyt", "ayt", "yks", "kpss", "tus", "lgs", "ales", "uni"]).optional(),
    studyBand: z.enum(["ortaokul", "lise", "sinav", "universite"]).optional(),
    examOccasion: z.enum(["okul", "vize", "genel"]).optional(),
    /** Sınavın saati ve yeri (30 Ekim 2026, isteğe bağlı): göç yok, bu jsonb alanında durur. */
    examTime: z.string().regex(EXAM_TIME_PATTERN).optional(),
    examPlace: z.string().trim().max(EXAM_PLACE_MAX).optional(),
    /** Resmî müfredat başvurusu (1 Kasım 2026): kotalar burada saklanmaz, kayıttan yeniden hesaplanır. */
    curriculum: z
      .object({
        programId: z.string().regex(/^[a-z0-9-]{3,60}$/),
        examKey: z.enum(["d1y1", "d1y2", "serbest"]),
        scenario: z.union([z.number().int().min(1).max(20), z.literal("karma")]).nullable(),
        /** YKS oturumu (sınıf düzeyine göre süzgeç); yoksa tüm YKS. */
        part: z.enum(["TYT", "AYT"]).nullable().optional(),
      })
      .optional(),
    /**
     * Resmî sınav kurulumu (1 Kasım 2026, ÖSYM/MEB kayıt defteri): çok dersli tek hazırlık. Her konu bir resmî
     * ünitedir; konunun kazanım kodları burada durur (ders anlatımı ve quiz dayanağı). Öz değerlendirme
     * (Biliyorum / Orta / Zayıf) sonraki fazlarda α/β başlangıcını besler.
     */
    officialPlan: z
      .object({
        exam: z.enum(["yks", "lgs"]),
        alan: z.enum(["tyt", "say", "ea", "soz", "dil"]).nullable(),
        singleSubject: z.boolean(),
        units: z
          .array(
            z.object({
              topic: z.string().min(2).max(120),
              programId: z.string().regex(/^[a-z0-9-]{3,60}$/),
              part: z.enum(["TYT", "AYT"]).nullable(),
              unitId: z.string().regex(/^[a-z0-9-]{3,60}#\d{1,3}$/),
              codes: z.array(z.string().min(1).max(40)).min(1).max(300),
              rating: z.enum(["iyi", "orta", "zayif"]).nullable(),
            }),
          )
          .min(1)
          .max(PREP_TOPIC_CAP),
      })
      .optional(),
  })
  .optional();

/** Resmî kurulum planı kayıtla doğrulanır; konu listesi planın konularıyla birebir aynı olmalı. */
function checkedOfficialPlan<
  T extends { officialPlan?: { units: (OrderableUnit & { unitId: string; codes: string[] })[] } },
>(
  prefs: T,
  topics: string[],
): T | null {
  if (!prefs.officialPlan) return prefs;
  const units = verifyPlannedUnits(prefs.officialPlan.units);
  if (units.length !== prefs.officialPlan.units.length) return null;
  if (units.length !== topics.length || units.some((u, i) => u.topic !== topics[i])) return null;
  // Öz değerlendirme sırayı belirler: Zayıf öne (ders içi sıra korunur), Biliyorum sona.
  return { ...prefs, officialPlan: { ...prefs.officialPlan, units: orderOfficialUnits(units) } };
}

// Serbest metinler reddedilmez, kırpılır (Paket I #12): 43 karakterlik ders adı kurulumu 400 ile düşürüyordu.
const bodySchema = z.object({
  title: lenientText(120, 2),
  examType: lenientText(40, 2).default("okul"),
  targetScore: z.number().int().min(1).max(100).optional(),
  topics: z.array(lenientText(120)).min(1).max(PREP_TOPIC_CAP),
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: lenientText(500, 0).optional(),
  documentId: z.string().uuid().optional(),
  documentIds: z.array(z.string().uuid()).max(PREP_DOCUMENT_REQUEST_MAX).optional(),
  /**
   * Hızlı başlatma (31 Ekim 2026): kurulum hazır olan materyalle kurulur; bunlar henüz okunmakta olan belgeler.
   * Hazırlığa bekleyen olarak yazılır, hazırlık sayfası okunup haritalanınca add-source ile ekler.
   */
  pendingDocumentIds: z.array(z.string().uuid()).max(PREP_DOCUMENT_REQUEST_MAX).optional(),
  dailyMinutes: z.number().int().min(5).max(480).optional(),
  studyDays: z.array(z.number().int().min(1).max(7)).max(7).optional(),
  hardTopics: z.array(lenientText(120)).max(PREP_TOPIC_CAP).optional(),
  learningPreferences: prefsSchema,
  /** Öğrenci konu oklarıyla sırayı değiştirdiyse otomatik önkoşul sırası yazılmaz. */
  topicOrderManual: z.boolean().optional(),
  /**
   * "Bu derse ne kadar aşinasın?" kurulumda bir kez (18 Ekim 2026, ürün sahibinin kararı). Bütün
   * konulara yazılır; önceden yazılan ders bu düzeyle yazılır, açılıştaki soru kalkar.
   */
  familiarity: z.enum(["new", "heard", "basics", "good", "confident"]).optional(),
});

/** 400 cevabında öğrenciye söylenen alan adları. */
const CREATE_FIELD_LABELS: Record<string, string> = {
  title: "hazırlık adı",
  examType: "ders adı",
  targetScore: "hedef puan",
  topics: "konular",
  examDate: "sınav tarihi",
  note: "not",
  documentId: "belge",
  documentIds: "belgeler",
  pendingDocumentIds: "bekleyen belgeler",
  dailyMinutes: "günlük süre",
  studyDays: "çalışma günleri",
  hardTopics: "odak konular",
  learningPreferences: "çalışma tercihleri",
  familiarity: "aşinalık",
};

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-prep-create", limit: 12 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidInputResponse(parsed.error, CREATE_FIELD_LABELS);
  const learningPreferences = parsed.data.learningPreferences
    ? checkedOfficialPlan(parsed.data.learningPreferences, parsed.data.topics)
    : undefined;
  if (learningPreferences === null) {
    return NextResponse.json({ error: "Resmî konu listesi doğrulanamadı; sayfayı yenileyip tekrar dene." }, { status: 400 });
  }

  // Ücretsiz hesap bir hazırlık kurabilir (3 Ekim 2026; Astra'da ücretsiz
  // hesap yeni hazırlık kuramıyor).
  if (await freePrepLimitReached(service, userId)) {
    return NextResponse.json(
      { error: FREE_PREP_LIMIT_MESSAGE, code: FREE_PREP_LIMIT_CODE },
      { status: 402 },
    );
  }

  const v2 = await isFeatureEnabled(service, PDF_LEARNING_V2_FLAG);
  const officialUnits = learningPreferences?.officialPlan?.units ?? null;
  const requestedTopics = officialUnits ? officialUnits.map((u) => u.topic) : parsed.data.topics;
  const knownTopics = officialUnits ? officialUnits.filter((u) => u.rating === "iyi").map((u) => u.topic) : [];
  let topics = parsed.data.note?.trim()
    ? [...requestedTopics, parsed.data.note.trim()]
    : [...requestedTopics];
  let topicNodeIds: (string | null)[] = topics.map(() => null);
  let scheduleTopics: ScheduleTopicInput[] = [];

  const documentIds = orderedSourceDocumentIds({
    documentId: parsed.data.documentId,
    documentIds: parsed.data.documentIds,
  });
  // Öğrencinin son listesi yolu kurar. Otomatik birleştirme konu silmez;
  // öğrenci kaldırdıysa o başlık burada yoktur. Belgede olmayan başlık
  // reddedilir. Hazır analiz yeniden üretilmez.
  if (documentIds.length) {
    const grounded = await groundPrepTopics(service, userId, documentIds, topics);
    if (!grounded.ok) {
      return NextResponse.json({ error: grounded.message }, { status: 400 });
    }
    if (v2) {
      const loaded = await loadScheduleTopics(
        service,
        documentIds,
        parsed.data.hardTopics ?? [],
        userId,
      );
      if (loaded.titles.length || grounded.matches.length) {
        const applied = applyStudentTopicList({
          requested: grounded.titles.map((title, index) => ({
            title,
            linkedTitle: grounded.matches[index]?.linkedTitle ?? null,
            pageNumbers: grounded.matches[index]?.pageNumbers ?? [],
            sourceRefs: grounded.matches[index]?.sourceRefs ?? [],
          })),
          loaded,
          hardTopics: parsed.data.hardTopics ?? [],
        });
        if (applied.titles.length) {
          const paired = applied.scheduleTopics.map((topic, index) => ({
            ...topic,
            title: applied.titles[index] ?? topic.title,
            nodeId: applied.nodeIds[index],
          }));
          // Haritadan gelen liste sihirbazda öğrencinin gördüğü sıradır ("Yol bu listeyle kurulur").
          const ordered = orderTopicsForPath(paired, {
            manualOrder: parsed.data.topicOrderManual === true || loaded.fromOutline === true,
          });
          topics = ordered.map((topic) => topic.title);
          topicNodeIds = ordered.map((topic) => topic.nodeId ?? null);
          scheduleTopics = ordered;
        }
      }
    }
    // Eski belgelerin saklı analizinde sayfa başlığı ("KPSS HUKUKUN TEMEL
    // KAVRAMLARI") ve test sorusu kökü konu olarak duruyor (2 Ekim 2026'da
    // KPSS hazırlığında 20 tane temizlendi). Yalnız belgeden gelen başlık
    // süzülür; öğrencinin elle yazdığı konuya dokunulmaz.
    const edges = (await Promise.all(documentIds.map((id) => documentRunningHeaders(service, id)))).flat();
    const keep = topics.map(
      (title, index) =>
        !isRunningHeader(title, edges) && !(topicNodeIds[index] && isJunkTopicTitle(title)),
    );
    if (keep.some((kept) => !kept) && keep.some(Boolean)) {
      topics = topics.filter((_, index) => keep[index]);
      topicNodeIds = topicNodeIds.filter((_, index) => keep[index]);
      if (scheduleTopics.length === keep.length) scheduleTopics = scheduleTopics.filter((_, index) => keep[index]);
    }
  }

  // Belgesiz hazırlık da konu konu kurulur (19 Ekim 2026): önceden takvim yalnız belgeden doluyordu,
  // belgesiz yol kalıp şablondan çıkıyordu (beş konu için konusuz tek "Giriş Dersi").
  const topicOnly = !documentIds.length && v2 && topics.length > 0;
  if (topicOnly) scheduleTopics = topicOnlyScheduleTopics(topics, parsed.data.hardTopics ?? [], knownTopics);

  const hardSet = new Set(
    (parsed.data.hardTopics ?? []).map((t) => t.trim().toLocaleLowerCase("tr")),
  );
  // Sihirbaz çalışma günü sormuyor (Astra da sormuyor). Sorulmadıysa her gün sayılır: 19 Ekim 2026'da
  // 25 gün sonraki sınavın planı yalnız hafta içiyle 18 güne indi ve son güne on konu yığıldı.
  // Öğrenci günleri hazırlık ayarlarından daraltabilir; seçim kayda geçer.
  const studyDays = prepStudyDays(parsed.data.studyDays);
  const dailyMinutes = prepDailyMinutes(parsed.data.dailyMinutes);
  const bandGrade = {
    ortaokul: "7. sınıf",
    lise: "10. sınıf",
    sinav: "12. sınıf",
    universite: "Mezun",
  } as const;
  const studyBand = parsed.data.learningPreferences?.studyBand;
  if (studyBand) {
    const { data: profile } = await service.from("profiles").select("grade_level").eq("id", userId).maybeSingle();
    if (!profile?.grade_level) {
      await service.from("profiles").update({ grade_level: bandGrade[studyBand] }).eq("id", userId);
    }
  }

  let scheduleSummary: ReturnType<typeof buildExamScheduleV2> | null = null;
  let scheduleDrafts: ReturnType<typeof scheduleSessionsToNodeDrafts> | null = null;
  let v2Nodes:
    | {
        kind: import("@/lib/learning/exam-prep-plan").PlanNodeKind;
        title: string;
        day_index: number;
        sort_order: number;
        status: "ready" | "locked";
      }[]
    | undefined;

  if (v2 && scheduleTopics.length) {
    const modalities = parsed.data.learningPreferences?.modalities ?? [];
    const includeAudio = !(
      modalities.includes("reading") &&
      modalities.includes("practice") &&
      !modalities.includes("listening") &&
      !modalities.includes("watching")
    );
    // Ara sınavlar (vize, quiz): belgeden ve öğrencinin takviminden; okuma düşerse kontrol adımı konmaz.
    const checkpoints = await loadScheduleCheckpoints(service, {
      userId,
      documentIds,
      examDate: parsed.data.examDate,
    }).catch(() => []);
    scheduleSummary = buildExamScheduleV2({
      daysToExam: daysUntilExam(parsed.data.examDate),
      dailyMinutes,
      studyDays,
      topics: scheduleTopics,
      targetScore: parsed.data.targetScore,
      includeAudio,
      checkpoints,
    });
    scheduleDrafts = mergeStudyPathTemplate(
      scheduleSessionsToNodeDrafts(scheduleSummary.sessions),
      includeAudio ? undefined : { skipKinds: ["podcast", "oral"] },
    );
    v2Nodes = scheduleDrafts.map((d, index) => ({
      kind: d.kind,
      title: d.title,
      day_index: d.dayIndex,
      sort_order: d.sortOrder,
      status: (index === 0 ? "ready" : "locked") as "ready" | "locked",
    }));
  }

  const result = await insertExamPrepGraph(service, {
    userId,
    title: parsed.data.title,
    examType: parsed.data.examType,
    topics,
    examDate: parsed.data.examDate,
    targetScore: parsed.data.targetScore,
    documentId: documentIds[0] ?? null,
    nodes: v2Nodes,
  });

  if ("error" in result) return errorResponse(500, result.error ?? "exam_prep_failed");

  // Belgesiz: takvimin geçici konu kimlikleri (topic:i) kayıtlı konuların kimliğine çevrilir; düğüm
  // rotası konuyu session_meta.topicId ile arıyor.
  if (topicOnly && scheduleSummary) {
    const { data: savedTopics } = await service
      .from("exam_prep_topics")
      .select("id, sort_order")
      .eq("exam_prep_id", result.prepId);
    const idFor = topicIdMap((savedTopics ?? []) as { id: string; sort_order: number }[]);
    scheduleSummary = remapTopicIds(scheduleSummary, idFor);
    scheduleDrafts = remapTopicIds(scheduleDrafts, idFor);
  }

  await service
    .from("exam_preps")
    .update({
      daily_minutes: dailyMinutes,
      study_days: studyDays,
      hard_topics_self: parsed.data.hardTopics ?? [],
      learning_preferences: withKnownCurriculum(learningPreferences),
      ...(scheduleSummary
        ? {
            schedule_v2: {
              fits: scheduleSummary.fits,
              availableMinutes: scheduleSummary.availableMinutes,
              requiredMinutes: scheduleSummary.requiredMinutes,
              cutTopicIds: scheduleSummary.cutTopicIds,
              optionsIfTight: scheduleSummary.optionsIfTight,
              studyDayDates: scheduleSummary.studyDayDates,
              orderedTopicIds: scheduleSummary.orderedTopicIds,
              summary: scheduleSummary.summary,
              // Ara sınavlar kayda geçer: yeniden planlama (`redistributeRemainingSchedule`) bunları korur.
              ...(scheduleSummary.checkpoints?.length ? { checkpoints: scheduleSummary.checkpoints } : {}),
              sessions: alignNewSessionSortOrders(
                scheduleSummary.sessions,
                scheduleDrafts ?? [],
                [],
              ),
            },
          }
        : {}),
    })
    .eq("id", result.prepId)
    .eq("user_id", userId);

  if (documentIds.length) {
    await service
      .from("exam_preps")
      .update({ source_document_ids: documentIds })
      .eq("id", result.prepId)
      .eq("user_id", userId);
  }

  const orderWrite = await service
    .from("exam_preps")
    .update({ topic_order_manual: parsed.data.topicOrderManual === true })
    .eq("id", result.prepId)
    .eq("user_id", userId);
  if (orderWrite.error && !missingColumn(orderWrite.error)) {
    console.error("topic order flag", orderWrite.error.message);
  }

  const contradictionDocs = await readContradictionDocuments(service, documentIds).catch(() => []);
  const contradictionMap = await contradictionsByTopicTitleResolved(
    service,
    userId,
    scheduleTopics.map((topic) => ({
      title: topic.title,
      sources: (topic.sourceRefs ?? []).map((source) => ({
        documentId: source.documentId,
        pages: source.pages,
      })),
    })),
    contradictionDocs,
  );

  if (scheduleSummary) {
    const { data: nodeRows } = await service
      .from("exam_prep_nodes")
      .select("id, sort_order")
      .eq("exam_prep_id", result.prepId)
      .order("sort_order");
    const metaBySort = sessionMetaBySortOrder(scheduleDrafts ?? []);
    // 1 Kasım 2026: 130 kazanımlı resmî hazırlıkta ~900 düğüm sırayla güncelleniyordu (~25 sn "Kuruluyor…").
    // Satırlar birbirinden bağımsız; aynı anda en çok WRITE_LANES istek.
    await runPool(nodeRows ?? [], WRITE_LANES, async (row) => {
      const meta = metaBySort.get(row.sort_order as number);
      if (!meta) return true;
      const { error } = await service.from("exam_prep_nodes").update({ session_meta: meta }).eq("id", row.id);
      return !error;
    });

    try {
      const { isFeatureEnabled, ADAPTIVE_LEARNING_FLAG } = await import(
        "@/lib/admin/feature-flags"
      );
      if (await isFeatureEnabled(service, ADAPTIVE_LEARNING_FLAG, userId)) {
        const { commitMasterPlanVersion } = await import(
          "@/lib/adaptive/master-plan-engine"
        );
        const { data: prepRow } = await service
          .from("exam_preps")
          .select("schedule_v2")
          .eq("id", result.prepId)
          .maybeSingle();
        if (prepRow?.schedule_v2) {
          await commitMasterPlanVersion(service, {
            userId,
            examPrepId: result.prepId,
            trigger: "initial",
            schedule: prepRow.schedule_v2 as import("@/lib/learning/exam-schedule-v2").ScheduleBuildResult,
            previousVersion: 0,
          });
        }
      }
    } catch {
      // Adaptive snapshot must not break exam prep create.
    }
  }

  const { data: prepTopics } = await service
    .from("exam_prep_topics")
    .select("id, label, sort_order")
    .eq("exam_prep_id", result.prepId)
    .order("sort_order");

  await runPool(prepTopics ?? [], WRITE_LANES, async (topic) => {
    const nodeId = topicNodeIds[topic.sort_order] ?? null;
    const isHard = hardSet.has(String(topic.label).trim().toLocaleLowerCase("tr"));
    await service
      .from("exam_prep_topics")
      .update({
        document_topic_node_id: nodeId,
        // Self-report only — measured_level stays null until diagnostic. Zor diye işaretlenen
        // konu kurulumdaki düzeyden yüksek başlamaz (en çok "duymuştum").
        familiarity: isHard
          ? parsed.data.familiarity === "new"
            ? "new"
            : "heard"
          : (parsed.data.familiarity ?? null),
        measured_level: "unknown",
        diagnostic_status: "unmeasured",
      })
      .eq("id", topic.id);
    const schedule = scheduleTopics[topic.sort_order as number];
    const extras: {
      source_refs?: TopicSourceRef[];
      contradictions?: TopicContradiction[];
    } = {
      source_refs: schedule?.sourceRefs ?? [],
      contradictions: contradictionMap.get(String(topic.label)) ?? [],
    };
    const extraWrite = await service.from("exam_prep_topics").update(extras).eq("id", topic.id);
    if (extraWrite.error && !missingColumn(extraWrite.error)) {
      console.error("topic sources", extraWrite.error.message);
    }
    return true;
  });

  // Hızlı başlatma: henüz okunan belgeler hazırlığa bekleyen olarak bağlanır (kurulumun belgeleri hariç).
  const mapped = new Set([...(parsed.data.documentIds ?? []), ...(parsed.data.documentId ? [parsed.data.documentId] : [])]);
  const pendingIds = (parsed.data.pendingDocumentIds ?? []).filter((id) => !mapped.has(id));
  const pendingRecorded = pendingIds.length
    ? await recordPendingMaterials(service, { prepId: result.prepId, userId, documentIds: pendingIds })
    : 0;
  // Pencereli işleme (31 Ekim 2026): bekleyen belgelerin pencere işçisi hemen başlar; öğrenci hazırlık sayfasına
  // geçmeden ilk pencere okunmaya, haritalanmaya başlar (şerit de dürter; aynı anda tek işçi).
  if (pendingRecorded) {
    const origin = new URL(request.url).origin;
    after(() => requestPendingAdvance({ origin, userId, prepId: result.prepId }));
  }

  // İlk ders hemen yazılmaya başlar (18 Ekim 2026, ürün sahibinin kararı): öğrenci hazırlık
  // sayfasından "Devam et"e basana kadar dersin başı hazır olur; kredi açılınca düşer.
  if (v2) {
    const origin = new URL(request.url).origin;
    // Önce öğretmen analizi (belge yüklenince başlamıştı; yoksa burada): ilk ders "Sınavda
    // sorulur" notuyla yazılsın. En çok TEACHER_ANALYSIS_WAIT_MS beklenir, sonra notsuz yazılır.
    after(async () => {
      const documentIds = await loadPrepDocumentIds(service, result.prepId).catch(() => [] as string[]);
      if (documentIds.length) {
        await Promise.race([
          ensureTeacherAnalyses(service, { userId, documentIds }).catch(() => undefined),
          new Promise((resolve) => setTimeout(resolve, TEACHER_ANALYSIS_WAIT_MS)),
        ]);
      }
      // Yeni hazırlığın ilk dersi Plus'ta hızlı işlemle (30 Ekim 2026): öğrenci kurulumdan hemen sonra açıyor.
      await requestPrepPrefetch(service, { origin, userId, prepId: result.prepId }, { firstLesson: true });
    });
  }

  return NextResponse.json({
    ok: true,
    prepId: result.prepId,
    days: result.days,
    pendingMaterials: pendingRecorded,
    intakeMode: v2 && topicNodeIds.some(Boolean) ? "v2" : "legacy",
    schedule: scheduleSummary
      ? {
          fits: scheduleSummary.fits,
          summary: scheduleSummary.summary,
          optionsIfTight: scheduleSummary.optionsIfTight,
          cutTopicIds: scheduleSummary.cutTopicIds,
          sessionCount: scheduleSummary.sessions.length,
        }
      : null,
  });
}
