import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { isFeatureEnabled, PDF_LEARNING_V2_FLAG } from "@/lib/admin/feature-flags";
import { pickMainTopics } from "@/lib/learning/diagnostic";
import { daysUntilExam } from "@/lib/learning/exam-prep-plan";
import { insertExamPrepGraph } from "@/lib/learning/exam-prep-insert";
import {
  buildExamScheduleV2,
  scheduleSessionsToNodeDrafts,
  type ScheduleTopicInput,
} from "@/lib/learning/exam-schedule-v2";

const prefsSchema = z
  .object({
    style: z.enum(["examples", "theory", "mixed"]).optional(),
    pace: z.enum(["slow", "normal", "fast"]).optional(),
    notes: z.string().max(400).optional(),
  })
  .optional();

const bodySchema = z.object({
  title: z.string().min(2).max(120),
  examType: z.string().min(2).max(40).default("okul"),
  targetScore: z.number().int().min(1).max(100).optional(),
  topics: z.array(z.string().min(1).max(120)).min(1).max(24),
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  note: z.string().max(500).optional(),
  documentId: z.string().uuid().optional(),
  dailyMinutes: z.number().int().min(5).max(480).optional(),
  studyDays: z.array(z.number().int().min(1).max(7)).max(7).optional(),
  hardTopics: z.array(z.string().min(1).max(120)).max(24).optional(),
  learningPreferences: prefsSchema,
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

  if (v2 && parsed.data.documentId) {
    const { data: nodes } = await service
      .from("document_topic_nodes")
      .select(
        "id, title, parent_id, sort_order, learning_objective, prerequisites",
      )
      .eq("document_id", parsed.data.documentId)
      .order("sort_order");
    const mains = pickMainTopics(
      (nodes ?? []).map((n) => ({
        id: n.id as string,
        title: n.title as string,
        parentId: (n.parent_id as string | null) ?? null,
      })),
    );
    if (mains.length) {
      topics = mains.map((n) => n.title);
      topicNodeIds = mains.map((n) => n.id);
      const mainRows = (nodes ?? []).filter((n) =>
        mains.some((m) => m.id === n.id),
      );
      const { data: links } = await service
        .from("document_topic_page_links")
        .select("topic_id, page_number")
        .eq("document_id", parsed.data.documentId)
        .in(
          "topic_id",
          mainRows.map((n) => n.id as string),
        );
      const pagesByTopic = new Map<string, number[]>();
      for (const link of links ?? []) {
        const list = pagesByTopic.get(link.topic_id as string) ?? [];
        list.push(link.page_number as number);
        pagesByTopic.set(link.topic_id as string, list);
      }
      const hardSet = new Set(
        (parsed.data.hardTopics ?? []).map((t) =>
          t.trim().toLocaleLowerCase("tr"),
        ),
      );
      scheduleTopics = mainRows.map((n) => ({
        id: n.id as string,
        title: n.title as string,
        objective: (n.learning_objective as string | null) ?? null,
        prerequisites: Array.isArray(n.prerequisites)
          ? (n.prerequisites as string[])
          : [],
        pageNumbers: [...new Set(pagesByTopic.get(n.id as string) ?? [])].sort(
          (a, b) => a - b,
        ),
        measuredLevel: "unknown" as const,
        selfHard: hardSet.has(
          String(n.title).trim().toLocaleLowerCase("tr"),
        ),
      }));
    }
  }

  const hardSet = new Set(
    (parsed.data.hardTopics ?? []).map((t) => t.trim().toLocaleLowerCase("tr")),
  );

  let scheduleSummary: ReturnType<typeof buildExamScheduleV2> | null = null;
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
    const drafts = scheduleSessionsToNodeDrafts(scheduleSummary.sessions);
    v2Nodes = drafts.map((d, index) => ({
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
    documentId: parsed.data.documentId ?? null,
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
              sessions: scheduleSummary.sessions,
            },
          }
        : {}),
    })
    .eq("id", result.prepId)
    .eq("user_id", userId);

  if (scheduleSummary) {
    const { data: nodeRows } = await service
      .from("exam_prep_nodes")
      .select("id, sort_order")
      .eq("exam_prep_id", result.prepId)
      .order("sort_order");
    const drafts = scheduleSessionsToNodeDrafts(scheduleSummary.sessions);
    for (const row of nodeRows ?? []) {
      const draft = drafts.find((d) => d.sortOrder === row.sort_order);
      if (!draft) continue;
      await service
        .from("exam_prep_nodes")
        .update({ session_meta: draft.meta })
        .eq("id", row.id);
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
