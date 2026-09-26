/**
 * Master plan replan gates — Jev may signal; code decides.
 */

export type ReplanTrigger =
  | "initial"
  | "exam_date_changed"
  | "target_changed"
  | "source_scope_changed"
  | "missed_days"
  | "behind_schedule"
  | "mastery_assumption_wrong"
  | "availability_changed"
  | "manual";

const ALLOWED: ReadonlySet<ReplanTrigger> = new Set([
  "initial",
  "exam_date_changed",
  "target_changed",
  "source_scope_changed",
  "missed_days",
  "behind_schedule",
  "mastery_assumption_wrong",
  "availability_changed",
  "manual",
]);

/** Micro mistakes never replan the master plan. */
export function shouldReplanMaster(input: {
  trigger: ReplanTrigger;
  /** Jev probability for daily replan — not sufficient alone for master. */
  jevNeedsDailyReplan?: boolean;
  missedDayCount?: number;
  behindBySessions?: number;
}): boolean {
  if (!ALLOWED.has(input.trigger)) return false;
  if (input.trigger === "missed_days") {
    return (input.missedDayCount ?? 0) >= 1;
  }
  if (input.trigger === "behind_schedule") {
    // Daily Jev signal alone must not rewrite master plan.
    if (input.jevNeedsDailyReplan) {
      return (input.behindBySessions ?? 0) >= 2;
    }
    return (input.behindBySessions ?? 0) >= 2;
  }
  return true;
}

export function shouldReplanDaily(input: {
  flagEnabled: boolean;
  jevNeedsDailyReplan: boolean;
  jevConfidence: number;
  mediumConfidence: number;
  materialBehind: boolean;
  newReviewDue: boolean;
}): boolean {
  if (!input.flagEnabled) return false;
  if (input.materialBehind || input.newReviewDue) return true;
  return (
    input.jevNeedsDailyReplan && input.jevConfidence >= input.mediumConfidence
  );
}
