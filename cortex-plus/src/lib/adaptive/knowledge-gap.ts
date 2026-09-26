/**
 * Knowledge gap classification from answer evidence + Jev severity.
 */

import type { KnowledgeGapKind } from "@/lib/adaptive/types";

export function classifyKnowledgeGap(input: {
  correct: boolean;
  hintUsed: boolean;
  retry: boolean;
  misconceptionTag?: string | null;
  misconceptionSeverity: number;
  repeatedErrorCount: number;
  responseTimeMs?: number | null;
  expectedTimeMs?: number | null;
}): KnowledgeGapKind | null {
  if (input.correct) return null;

  if (
    input.responseTimeMs != null &&
    input.expectedTimeMs != null &&
    input.responseTimeMs < input.expectedTimeMs * 0.35 &&
    !input.misconceptionTag
  ) {
    return "careless_error";
  }

  if (input.misconceptionSeverity >= 3 || input.repeatedErrorCount >= 3) {
    return "prerequisite_gap";
  }
  if (input.misconceptionSeverity >= 2 || input.misconceptionTag) {
    return "conceptual_gap";
  }
  if (input.hintUsed || input.retry) {
    return "procedural_gap";
  }
  return "isolated_mistake";
}
