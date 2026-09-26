/**
 * TutorModelRouter — default gpt-4o-mini; escalate only with hard rules + signals.
 */

import { env } from "@/lib/env";
import type { TutorModel } from "@/lib/adaptive/types";

/** Traceable escalation reason codes (content + decision routing). */
export type TutorEscalationReason =
  | "COMPLEX_REASONING"
  | "COMPLEX_VISUAL"
  | "REPEATED_MINI_FAILURE"
  | "LOW_EVALUATION_CONFIDENCE"
  | "CONFLICTING_SOURCE_INFORMATION"
  | "HIGH_STAKES_ASSESSMENT"
  | "ROUTER_DISABLED"
  | "DEFAULT_MINI"
  | "JEV_SIGNAL_IGNORED"
  | "JEV_NEEDS_GPT4O";

export type TutorRouteInput = {
  /** Feature flag adaptive_model_router_enabled */
  routerEnabled: boolean;
  jevNeedsGpt4o: boolean;
  hasComplexVisual?: boolean;
  advancedReasoning?: boolean;
  repeatedConfusion?: boolean;
  conflictingConcepts?: boolean;
  lowEvalConfidence?: boolean;
  highImpactAssessment?: boolean;
  complexSourceSynthesis?: boolean;
  modelFailure?: boolean;
};

export type TutorRoute = {
  model: TutorModel;
  modelId: string;
  escalated: boolean;
  reasons: TutorEscalationReason[];
};

export function routeTutorModel(input: TutorRouteInput): TutorRoute {
  const standard = (env.OPENAI_STANDARD_MODEL || "gpt-4o-mini") as string;
  const advanced = (env.OPENAI_ADVANCED_MODEL || "gpt-4o") as string;

  if (!input.routerEnabled) {
    return {
      model: "gpt-4o-mini",
      modelId: standard,
      escalated: false,
      reasons: ["ROUTER_DISABLED"],
    };
  }

  const reasons: TutorEscalationReason[] = [];
  if (input.hasComplexVisual) reasons.push("COMPLEX_VISUAL");
  if (input.advancedReasoning) reasons.push("COMPLEX_REASONING");
  if (input.modelFailure) reasons.push("REPEATED_MINI_FAILURE");
  if (input.repeatedConfusion) reasons.push("REPEATED_MINI_FAILURE");
  if (input.conflictingConcepts) reasons.push("CONFLICTING_SOURCE_INFORMATION");
  if (input.lowEvalConfidence) reasons.push("LOW_EVALUATION_CONFIDENCE");
  if (input.highImpactAssessment) reasons.push("HIGH_STAKES_ASSESSMENT");
  if (input.complexSourceSynthesis) reasons.push("COMPLEX_REASONING");

  const hardHit = reasons.length > 0;
  const jevAssist =
    input.jevNeedsGpt4o &&
    (input.repeatedConfusion ||
      input.lowEvalConfidence ||
      input.advancedReasoning ||
      input.hasComplexVisual);

  if (hardHit || jevAssist) {
    if (input.jevNeedsGpt4o) reasons.push("JEV_NEEDS_GPT4O");
    return {
      model: "gpt-4o",
      modelId: advanced,
      escalated: true,
      reasons,
    };
  }

  return {
    model: "gpt-4o-mini",
    modelId: standard,
    escalated: false,
    reasons: input.jevNeedsGpt4o
      ? ["JEV_SIGNAL_IGNORED"]
      : ["DEFAULT_MINI"],
  };
}
