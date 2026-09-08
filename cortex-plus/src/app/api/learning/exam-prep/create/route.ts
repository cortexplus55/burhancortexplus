import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { isFeatureEnabled, PDF_LEARNING_V2_FLAG } from "@/lib/admin/feature-flags";
import { pickMainTopics } from "@/lib/learning/diagnostic";
import { insertExamPrepGraph } from "@/lib/learning/exam-prep-insert";

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

  if (v2 && parsed.data.documentId) {
    const { data: nodes } = await service
      .from("document_topic_nodes")
      .select("id, title, parent_id, sort_order")
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
    }
  }

  const result = await insertExamPrepGraph(service, {
    userId,
    title: parsed.data.title,
    examType: parsed.data.examType,
    topics,
    examDate: parsed.data.examDate,
    targetScore: parsed.data.targetScore,
    documentId: parsed.data.documentId ?? null,
  });

  if ("error" in result) return errorResponse(500, result.error ?? "exam_prep_failed");

  const hardSet = new Set(
    (parsed.data.hardTopics ?? []).map((t) => t.trim().toLocaleLowerCase("tr")),
  );

  await service
    .from("exam_preps")
    .update({
      daily_minutes: parsed.data.dailyMinutes ?? null,
      study_days: parsed.data.studyDays ?? [],
      hard_topics_self: parsed.data.hardTopics ?? [],
      learning_preferences: parsed.data.learningPreferences ?? {},
    })
    .eq("id", result.prepId)
    .eq("user_id", userId);

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
  });
}
