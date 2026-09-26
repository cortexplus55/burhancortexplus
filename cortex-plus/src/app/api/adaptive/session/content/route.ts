import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api/guards";
import {
  assertPrepOwner,
  withAdaptiveUser,
} from "@/lib/adaptive/api-guard";
import {
  generateActionContent,
  publicActionContent,
} from "@/lib/adaptive/action-content/generate-action-content";
import {
  loadStoredActionContent,
  storeActionContent,
} from "@/lib/adaptive/action-content/store";
import { loadExamGraph } from "@/lib/adaptive/exam-graph";
import type { GovernorAction, LearningAction, DifficultyLevel, TeachingMode, TutorModel, ReasonCode } from "@/lib/adaptive/types";

const actionSchema = z.object({
  action: z.string(),
  topicId: z.string(),
  topicKey: z.string(),
  teachingMode: z.string(),
  difficulty: z.string(),
  model: z.string().optional(),
  durationTarget: z.number(),
  reasonCode: z.string(),
  reasonCopy: z.string(),
  decisionTraceId: z.string().uuid(),
  sourceRefs: z.array(z.unknown()).optional(),
});

const bodySchema = z.object({
  examPrepId: z.string().uuid(),
  sessionId: z.string().uuid(),
  action: actionSchema,
  misconception: z.string().max(200).nullable().optional(),
});

export async function POST(request: Request) {
  const guard = await withAdaptiveUser(request, "adaptive-session-content");
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");
  if (!(await assertPrepOwner(guard.ctx, parsed.data.examPrepId))) {
    return errorResponse(404, "not_found");
  }

  const { data: session } = await service
    .from("adaptive_learning_sessions")
    .select("id")
    .eq("id", parsed.data.sessionId)
    .eq("user_id", userId)
    .eq("exam_prep_id", parsed.data.examPrepId)
    .maybeSingle();
  if (!session) return errorResponse(404, "not_found");

  const existing = await loadStoredActionContent(service, {
    userId,
    sessionId: parsed.data.sessionId,
    decisionTraceId: parsed.data.action.decisionTraceId,
  });
  if (existing) {
    return NextResponse.json({
      ok: true,
      content: publicActionContent(existing),
      cached: true,
    });
  }

  const a = parsed.data.action;
  const governorAction: GovernorAction = {
    action: a.action as LearningAction,
    topicId: a.topicId,
    topicKey: a.topicKey,
    teachingMode: a.teachingMode as TeachingMode,
    difficulty: a.difficulty as DifficultyLevel,
    model: (a.model === "gpt-4o" ? "gpt-4o" : "gpt-4o-mini") as TutorModel,
    durationTarget: a.durationTarget,
    sourceRefs: [],
    reasonCode: a.reasonCode as ReasonCode,
    reasonCopy: a.reasonCopy,
    decisionTraceId: a.decisionTraceId,
  };

  const graph = await loadExamGraph(service, parsed.data.examPrepId);
  const topic = graph.topics.find((t) => t.topicKey === a.topicKey);
  const topicTitle = topic?.title ?? a.topicKey;
  const documentId = topic?.sourceRefs.find((s) => s.documentId)?.documentId;

  try {
    const content = await generateActionContent(service, {
      userId,
      examPrepId: parsed.data.examPrepId,
      sessionId: parsed.data.sessionId,
      action: governorAction,
      topicTitle,
      misconception: parsed.data.misconception,
      documentId,
    });
    await storeActionContent(service, {
      userId,
      examPrepId: parsed.data.examPrepId,
      sessionId: parsed.data.sessionId,
      content,
    });
    return NextResponse.json({
      ok: true,
      content: publicActionContent(content),
      cached: false,
    });
  } catch (err) {
    console.error("[adaptive/session/content]", err);
    return errorResponse(500, "generation_failed");
  }
}
