/**
 * OpenAI structured decision provider.
 * Primary when Jev is intentionally unavailable; fallback only after a real Jev failure.
 */

import "server-only";
import OpenAI from "openai";
import { z } from "zod";
import { estimateTokenCostUsd } from "@/lib/adaptive/analytics";
import { normalizeDecisionPayload } from "@/lib/adaptive/jev/normalize";
import type {
  DecisionProvider,
  DecisionRequest,
} from "@/lib/adaptive/jev/providers/types";
import type {
  CompactDecisionState,
  JevDecisionResult,
  LearningAction,
} from "@/lib/adaptive/types";
import { TEACHING_MODES, DIFFICULTY_LEVELS } from "@/lib/adaptive/types";
import type { UsageCode } from "@/lib/credits/service";
import { env } from "@/lib/env";

const DecisionSchema = z
  .object({
    action: z.string().optional(),
    next_action: z.string().optional(),
    teachingMode: z.string().optional(),
    teaching_mode: z.string().optional(),
    difficulty: z.string().optional(),
    needsPrerequisiteReview: z.boolean().optional(),
    needs_prerequisite_review: z.boolean().optional(),
    readyToAdvance: z.boolean().optional(),
    ready_to_advance: z.boolean().optional(),
    needsHigherModel: z.boolean().optional(),
    needs_gpt4o: z.boolean().optional(),
    needsDailyReplan: z.boolean().optional(),
    needs_daily_replan: z.boolean().optional(),
    confidence: z.number().min(0).max(1),
    reasonCodes: z.array(z.string()).max(8).optional(),
    reason_codes: z.array(z.string()).max(8).optional(),
    misconception_severity: z.number().min(0).max(3).optional(),
  })
  .refine((row) => Boolean(row.action || row.next_action), {
    message: "action_required",
  });

function compactPromptState(state: CompactDecisionState) {
  return {
    student: {
      exam_days_remaining: state.student.exam_days_remaining,
      session_minutes_remaining: state.student.session_minutes_remaining,
    },
    objective: {
      topic_id: state.objective.topic_id,
      mastery: state.objective.mastery,
      mastery_confidence: state.objective.mastery_confidence,
      recent_accuracy: state.objective.recent_accuracy,
      evidence_count: state.objective.attempt_count,
    },
    evidence: {
      last_result: state.evidence.last_answer_correct,
      hint_dependency: state.evidence.hint_count,
      repeated_misconception: state.evidence.repeated_misconception,
      prerequisite_status: state.evidence.prerequisite_status ?? "met",
    },
    plan: {
      current_objective: state.plan.today_target,
      behind_schedule: state.plan.behind_schedule,
      review_due: state.plan.review_due === true,
    },
    candidate_actions: state.allowed_actions,
  };
}

function usageCodeFor(role: "primary" | "fallback", model: string): UsageCode {
  const advanced =
    model.toLowerCase().includes("gpt-4o") && !model.toLowerCase().includes("mini");
  if (advanced) return "ADAPTIVE_DECISION_ESCALATION";
  if (role === "fallback") return "ADAPTIVE_DECISION_FALLBACK";
  return "ADAPTIVE_DECISION";
}

export class OpenAIDecisionProvider implements DecisionProvider {
  readonly name = "openai_decision" as const;

  async decide(request: DecisionRequest): Promise<JevDecisionResult> {
    if (!env.OPENAI_API_KEY) {
      throw new Error("openai_key_missing");
    }
    const role = request.role ?? "primary";
    const model =
      request.model?.trim() ||
      env.OPENAI_STANDARD_MODEL ||
      "gpt-4o-mini";
    const provider = role === "fallback" ? "openai_fallback" : "openai_decision";
    const allowed = request.state.allowed_actions;
    const started = Date.now();
    const openai = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      timeout: 12_000,
      maxRetries: 0,
    });

    const system = [
      "You choose the next local learning action for one objective.",
      "Return only JSON.",
      "action must be one of candidate_actions.",
      "Do not build a course plan, and do not invent actions.",
    ].join(" ");

    const user = JSON.stringify({
      state: compactPromptState(request.state),
      teaching_modes: TEACHING_MODES,
      difficulties: DIFFICULTY_LEVELS,
      schema: {
        action: "one candidate_actions value",
        teachingMode: "one teaching mode",
        difficulty: "one difficulty",
        needsPrerequisiteReview: "boolean",
        readyToAdvance: "boolean",
        needsHigherModel: "boolean, content difficulty hint only",
        needsDailyReplan: "boolean",
        confidence: "number 0-1",
        reasonCodes: "short string array",
        misconception_severity: "integer 0-3",
      },
    });

    let tokensIn = 0;
    let tokensOut = 0;
    const completion = async (extra?: string) => {
      const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: "system", content: system },
        { role: "user", content: extra ? `${user}\n\n${extra}` : user },
      ];
      const result = await openai.chat.completions.create({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages,
      });
      tokensIn += result.usage?.prompt_tokens ?? 0;
      tokensOut += result.usage?.completion_tokens ?? 0;
      return result.choices[0]?.message?.content ?? "";
    };

    let rawText = "";
    try {
      rawText = await completion();
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : "openai_decision_failed");
    }

    const parsed = acceptDecision(rawText, allowed);
    let normalized = parsed;
    if (!normalized) {
      try {
        const repaired = await completion(
          `Previous output was invalid. Return only JSON. action must be one of: ${allowed.join(", ")}. Invalid output: ${rawText.slice(0, 1500)}`,
        );
        normalized = acceptDecision(repaired, allowed);
      } catch (err) {
        throw new Error(
          err instanceof Error ? err.message : "openai_decision_repair_failed",
        );
      }
    }
    if (!normalized) {
      throw new Error("schema_invalid");
    }

    if (request.service) {
      try {
        const { recordUsage } = await import("@/lib/credits/service");
        await recordUsage(request.service, {
          userId: request.userId,
          actionCode: usageCodeFor(role, model),
          model,
          tokensIn,
          tokensOut,
        });
      } catch {
        /* telemetry best-effort */
      }
    }

    const advanced =
      model.toLowerCase().includes("gpt-4o") && !model.toLowerCase().includes("mini");
    const result = normalizeDecisionPayload(normalized, {
      allowedActions: allowed,
      provider,
      latencyMs: Date.now() - started,
      fallbackReason:
        role === "fallback" ? (request.fallbackReason ?? "provider_failed") : null,
    });
    result.telemetry = {
      model,
      inputTokens: tokensIn,
      outputTokens: tokensOut,
      estimatedCostUsd: estimateTokenCostUsd(model, tokensIn, tokensOut),
      escalated: advanced,
      escalationReason: request.escalationReason ?? null,
    };
    return result;
  }
}

function acceptDecision(
  rawText: string,
  allowed: LearningAction[],
): Record<string, unknown> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
  const checked = DecisionSchema.safeParse(parsed);
  if (!checked.success) return null;
  const action = checked.data.action ?? checked.data.next_action ?? "";
  if (!allowed.includes(action as LearningAction)) return null;
  return {
    next_action: action,
    teaching_mode: checked.data.teachingMode ?? checked.data.teaching_mode,
    difficulty: checked.data.difficulty,
    needs_prerequisite_review:
      checked.data.needsPrerequisiteReview ??
      checked.data.needs_prerequisite_review ??
      false,
    ready_to_advance:
      checked.data.readyToAdvance ?? checked.data.ready_to_advance ?? false,
    needs_gpt4o:
      checked.data.needsHigherModel ?? checked.data.needs_gpt4o ?? false,
    needs_daily_replan:
      checked.data.needsDailyReplan ?? checked.data.needs_daily_replan ?? false,
    confidence: checked.data.confidence,
    misconception_severity: checked.data.misconception_severity ?? 0,
    reasonCodes: checked.data.reasonCodes ?? checked.data.reason_codes,
  };
}

/** Alias kept so existing imports continue to compile. */
export const OpenAIDecisionFallbackProvider = OpenAIDecisionProvider;
