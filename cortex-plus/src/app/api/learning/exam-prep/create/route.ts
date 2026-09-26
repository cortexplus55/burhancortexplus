import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { isFeatureEnabled, PDF_LEARNING_V2_FLAG } from "@/lib/admin/feature-flags";
import {
  daysUntilExam,
  mergeStudyPathTemplate,
  sessionMetaBySortOrder,
} from "@/lib/learning/exam-prep-plan";
import { insertExamPrepGraph } from "@/lib/learning/exam-prep-insert";
import { alignNewSessionSortOrders } from "@/lib/learning/exam-prep-reschedule-apply";
import {
  buildExamScheduleV2,
  scheduleSessionsToNodeDrafts,
  type ScheduleTopicInput,
} from "@/lib/learning/exam-schedule-v2";
import { applyStudentTopicList } from "@/lib/learning/apply-prep-topics";
import { groundPrepTopics } from "@/lib/learning/ground-prep-topics";
import { missingColumn } from "@/lib/learning/missing-column";
import {
  contradictionsByTopicTitleResolved,
  readContradictionDocuments,
} from "@/lib/learning/prep-contradiction-read";
import { orderedSourceDocumentIds } from "@/lib/learning/prep-source";
import { PREP_TOPIC_CAP } from "@/lib/learning/prep-topic-list";
import { loadScheduleTopics } from "@/lib/learning/prep-schedule-topics";
import type { TopicContradiction } from "@/lib/learning/source-contradictions";
import type { TopicSourceRef } from "@/lib/learning/topic-merge";
import { orderTopicsForPath } from "@/lib/learning/topic-order";

const prefsSchema = z
  .object({
    style: z.enum(["examples", "theory", "mixed"]).optional(),
    pace: z.enum(["slow", "normal", "fast"]).optional(),
    notes: z.string().max(400).optional(),
    modality: z
      .enum(["reading", "listening", "watching", "practice", "auto"])
      .optional(),
    language: z.enum(["tr", "en"]).optional(),
  })
  .optional();

const bodySchema = z.object({
  title: z.string().min(2).max(120),
  examType: z.string().min(2).max(40).default("okul"),
  targetScore: z.number().int().min(1).max(100).optional(),
  topics: z.array(z.string().min(1).max(120)).min(1).max(PREP_TOPIC_CAP),
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(500).optional(),
  documentId: z.string().uuid().optional(),
  documentIds: z.array(z.string().uuid()).max(8).optional(),
  dailyMinutes: z.number().int().min(5).max(480).optional(),
  studyDays: z.array(z.number().int().min(1).max(7)).max(7).optional(),
  hardTopics: z.array(z.string().min(1).max(120)).max(PREP_TOPIC_CAP).optional(),
  learningPreferences: prefsSchema,
  /** Öğrenci konu oklarıyla sırayı değiştirdiyse otomatik önkoşul sırası yazılmaz. */
  topicOrderManual: z.boolean().optional(),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-prep-create", limit: 12 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const v2 = await isFeatureEnabled(service, PDF_LEARNING_V2_FLAG);
  let topics = parsed.data.note?.trim()
    ? [...parsed.data.topics, parsed.data.note.trim()]
    : [...parsed.data.topics];
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
          const ordered = orderTopicsForPath(paired, {
            manualOrder: parsed.data.topicOrderManual === true,
          });
          topics = ordered.map((topic) => topic.title);
          topicNodeIds = ordered.map((topic) => topic.nodeId ?? null);
          scheduleTopics = ordered;
        }
      }
    }
  }

  const hardSet = new Set(
    (parsed.data.hardTopics ?? []).map((t) => t.trim().toLocaleLowerCase("tr")),
  );

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
    scheduleSummary = buildExamScheduleV2({
      daysToExam: daysUntilExam(parsed.data.examDate),
      dailyMinutes: parsed.data.dailyMinutes ?? 45,
      studyDays: parsed.data.studyDays?.length
        ? parsed.data.studyDays
        : [1, 2, 3, 4, 5],
      topics: scheduleTopics,
      targetScore: parsed.data.targetScore,
    });
    scheduleDrafts = mergeStudyPathTemplate(
      scheduleSessionsToNodeDrafts(scheduleSummary.sessions),
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

  await service
    .from("exam_preps")
    .update({
      daily_minutes: parsed.data.dailyMinutes ?? null,
      study_days: parsed.data.studyDays ?? [],
      hard_topics_self: parsed.data.hardTopics ?? [],
      learning_preferences: parsed.data.learningPreferences ?? {},
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
    for (const row of nodeRows ?? []) {
      const meta = metaBySort.get(row.sort_order as number);
      if (!meta) continue;
      await service
        .from("exam_prep_nodes")
        .update({ session_meta: meta })
        .eq("id", row.id);
    }

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

  for (const topic of prepTopics ?? []) {
    const nodeId = topicNodeIds[topic.sort_order] ?? null;
    const isHard = hardSet.has(String(topic.label).trim().toLocaleLowerCase("tr"));
    await service
      .from("exam_prep_topics")
      .update({
        document_topic_node_id: nodeId,
        // Self-report only — measured_level stays null until diagnostic.
        familiarity: isHard ? "heard" : null,
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
  }

  return NextResponse.json({
    ok: true,
    prepId: result.prepId,
    days: result.days,
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
