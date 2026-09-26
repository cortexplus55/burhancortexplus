/**
 * Exam approach regimes — pedagogical strategy by days remaining.
 * 20+: learn + understand + spaced repetition
 * ≤7: mixed practice + weakness repair + exam-style
 * ≤2: high-yield review + recall + mistakes + targeted assessment
 */

import type { LearningAction } from "@/lib/adaptive/types";

export type ExamPhase = "learn" | "mixed" | "cram";

export function examPhaseFromDays(daysRemaining: number | null): ExamPhase {
  if (daysRemaining == null) return "learn";
  if (daysRemaining <= 2) return "cram";
  if (daysRemaining <= 7) return "mixed";
  return "learn";
}

/** Prefer / deprioritize actions by phase (soft filter — keep at least one). */
export function filterActionsForExamPhase(
  actions: LearningAction[],
  phase: ExamPhase,
  topicMastery: number,
): LearningAction[] {
  if (actions.length <= 1) return actions;

  if (phase === "cram") {
    // Avoid starting major new low-priority teaching unless mastery is very low.
    const prefer: LearningAction[] = [
      "scheduled_review",
      "retrieval_practice",
      "mini_assessment",
      "practice",
      "easier_example",
      "reteach",
    ];
    if (topicMastery < 0.35) {
      prefer.push("teach", "worked_example", "prerequisite_review");
    }
    const filtered = actions.filter((a) => prefer.includes(a));
    return filtered.length > 0 ? filtered : actions;
  }

  if (phase === "mixed") {
    const deprioritizeNewTeach = topicMastery >= 0.55;
    if (deprioritizeNewTeach) {
      const filtered = actions.filter((a) => a !== "teach");
      return filtered.length > 0 ? filtered : actions;
    }
  }

  return actions;
}

export function examPhaseLabel(phase: ExamPhase): string {
  switch (phase) {
    case "cram":
      return "Yüksek getirili tekrar ve hatırlama";
    case "mixed":
      return "Karışık pratik ve zayıf nokta onarımı";
    default:
      return "Anlama, öğrenme ve aralıklı tekrar";
  }
}
