import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse } from "@/lib/api/guards";
import {
  assertPrepOwner,
  withAdaptiveUser,
} from "@/lib/adaptive/api-guard";
import { loadStoredActionContent } from "@/lib/adaptive/action-content/store";
import { evaluateAnswer } from "@/lib/adaptive/evaluate-answer";
import {
  parseDifficulty,
  submitEvidence,
} from "@/lib/adaptive/session-engine";
import { toStudentActionPayload } from "@/lib/adaptive/learning-governor";
import {
  INTERVENTION_SUCCESS_WINDOW,
  trackAdaptiveEventServer,
} from "@/lib/adaptive/analytics";
import type { LearningEvidence } from "@/lib/adaptive/types";

const bodySchema = z.object({
  examPrepId: z.string().uuid(),
  sessionId: z.string().uuid(),
  idempotencyKey: z.string().min(8).max(200),
  decisionTraceId: z.string().uuid().optional(),
  topicId: z.string().uuid().optional(),
  topicKey: z.string().min(1).max(200),
  /** Preferred: student answer for server-side grading. */
  studentAnswer: z.string().max(2000).optional(),
  /** Legacy self-report — used only when no stored question / answer. */
  correct: z.boolean().optional(),
  difficulty: z.string().optional(),
  independent: z.boolean().optional(),
  hintUsed: z.boolean().optional(),
  retry: z.boolean().optional(),
  transfer: z.boolean().optional(),
  examLevel: z.boolean().optional(),
  retrievalAfterDelay: z.boolean().optional(),
  misconceptionTag: z.string().max(200).nullable().optional(),
  misconceptionSeverity: z.number().min(0).max(3).optional(),
});

export async function POST(request: Request) {
  const guard = await withAdaptiveUser(request, "adaptive-session-evidence");
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

  let correct = parsed.data.correct;
  let misconceptionTag = parsed.data.misconceptionTag ?? null;
  let misconceptionSeverity = parsed.data.misconceptionSeverity ?? 0;
  let feedback: string | undefined;
  let evalKind: string | undefined;

  if (parsed.data.studentAnswer != null && parsed.data.decisionTraceId) {
    const stored = await loadStoredActionContent(service, {
      userId,
      sessionId: parsed.data.sessionId,
      decisionTraceId: parsed.data.decisionTraceId,
    });
    if (stored?.question) {
      const evaluation = await evaluateAnswer(service, {
        userId,
        question: stored.question,
        studentAnswer: parsed.data.studentAnswer,
        topicTitle: stored.title,
        misconceptionHint: stored.misconceptionAddressed,
        hintUsed: parsed.data.hintUsed,
      });
      correct = evaluation.correct;
      misconceptionTag = evaluation.misconceptionTag;
      feedback = evaluation.feedback;
      evalKind = evaluation.kind;
      if (
        evaluation.kind === "conceptual_misconception" ||
        evaluation.kind === "prerequisite_gap"
      ) {
        misconceptionSeverity = evaluation.kind === "prerequisite_gap" ? 3 : 2;
      } else if (!evaluation.correct) {
        misconceptionSeverity = 1;
      }
    }
  }

  if (typeof correct !== "boolean") {
    return errorResponse(400, "invalid_input");
  }

  const evidence: LearningEvidence = {
    topicId: parsed.data.topicId ?? "",
    topicKey: parsed.data.topicKey,
    correct,
    difficulty: parseDifficulty(parsed.data.difficulty),
    independent: parsed.data.independent ?? true,
    hintUsed: parsed.data.hintUsed ?? false,
    retry: parsed.data.retry ?? false,
    transfer: parsed.data.transfer ?? false,
    examLevel: parsed.data.examLevel ?? false,
    retrievalAfterDelay: parsed.data.retrievalAfterDelay ?? false,
    misconceptionTag,
    idempotencyKey: parsed.data.idempotencyKey,
  };

  try {
    const result = await submitEvidence(service, {
      userId,
      examPrepId: parsed.data.examPrepId,
      sessionId: parsed.data.sessionId,
      evidence,
      misconceptionSeverity,
    });

    if (!correct && (misconceptionTag || evalKind)) {
      trackAdaptiveEventServer("adaptive_intervention", {
        topic: evidence.topicKey,
        kind: evalKind ?? "incorrect",
        tag: misconceptionTag,
      });
      await service.from("adaptive_learning_events").insert({
        user_id: userId,
        exam_prep_id: parsed.data.examPrepId,
        session_id: parsed.data.sessionId,
        event_type: "misconception_detected",
        topic_key: evidence.topicKey,
        payload: {
          misconceptionTag,
          kind: evalKind,
          interventionWindow: INTERVENTION_SUCCESS_WINDOW,
        },
      });
    } else if (correct && evidence.independent !== false) {
      // Check intervention success within window.
      const { data: recent } = await service
        .from("adaptive_learning_events")
        .select("event_type, created_at")
        .eq("session_id", parsed.data.sessionId)
        .eq("topic_key", evidence.topicKey)
        .in("event_type", ["misconception_detected", "answer_submitted"])
        .order("created_at", { ascending: false })
        .limit(INTERVENTION_SUCCESS_WINDOW + 2);
      const hadIntervention = (recent ?? []).some(
        (e) => e.event_type === "misconception_detected",
      );
      if (hadIntervention) {
        trackAdaptiveEventServer("intervention_success", {
          topic: evidence.topicKey,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      duplicate: result.duplicate,
      mastery: result.mastery,
      action: result.action ? toStudentActionPayload(result.action) : null,
      correct,
      feedback,
      evaluationKind: evalKind,
      misconceptionTag,
    });
  } catch (err) {
    console.error("[adaptive/session/evidence]", err);
    return errorResponse(500, "generation_failed");
  }
}
