/**
 * Topic candidate shortlist — deterministic; Jev only sees top N.
 */

import { PRIORITY_V1 } from "@/lib/adaptive/config/mastery-v1";
import type { ExamGraph } from "@/lib/adaptive/exam-graph";
import { prerequisitesMet } from "@/lib/adaptive/exam-graph";
import { examPhaseFromDays } from "@/lib/adaptive/exam-phase";
import type { TopicMasteryState } from "@/lib/adaptive/types";
import { normalizeTopicKey } from "@/lib/learning/learning-tracking";

export type TopicCandidate = {
  topicId: string;
  topicKey: string;
  title: string;
  priority: number;
  reason:
    | "review_due"
    | "low_mastery"
    | "high_importance"
    | "plan"
    | "prerequisite_blocked";
};

export function prioritizeTopics(input: {
  graph: ExamGraph;
  topics: TopicMasteryState[];
  planTopicKeys?: string[];
  daysRemaining: number | null;
  now?: Date;
}): TopicCandidate[] {
  const now = input.now ?? new Date();
  const phase = examPhaseFromDays(input.daysRemaining);
  const masteryMap = new Map(
    input.topics.map((t) => [
      t.topicKey,
      { mastery: t.mastery, status: t.status },
    ]),
  );
  const planSet = new Set(
    (input.planTopicKeys ?? []).map((k) => normalizeTopicKey(k)),
  );
  const byKey = new Map(input.topics.map((t) => [t.topicKey, t]));

  const scored: TopicCandidate[] = [];
  for (const g of input.graph.topics) {
    const m = byKey.get(g.topicKey) ?? {
      mastery: 0,
      masteryConfidence: 0,
      reviewDueAt: null,
      status: "unseen" as const,
      topicId: g.topicId,
      topicKey: g.topicKey,
    };
    const prereqOk = prerequisitesMet(input.graph, g.topicKey, masteryMap);
    const importance =
      g.importance === "important" ? 1 : g.importance === "less" ? 0.4 : 0.7;
    const weight =
      typeof g.weightPercent === "number" ? g.weightPercent / 100 : importance;
    const deficit = 1 - (m.mastery ?? 0);
    const reviewDue =
      m.reviewDueAt && new Date(m.reviewDueAt).getTime() <= now.getTime();
    const reviewUrgency = reviewDue ? 1 : 0;
    const planUrgency = planSet.has(g.topicKey) ? 1 : 0;
    const dayPressure =
      input.daysRemaining != null && input.daysRemaining < 14
        ? 1 + (14 - input.daysRemaining) / 28
        : 1;

    let priority =
      PRIORITY_V1.importanceWeight * weight * dayPressure +
      PRIORITY_V1.masteryDeficitWeight * deficit +
      PRIORITY_V1.reviewUrgencyWeight * reviewUrgency +
      PRIORITY_V1.planUrgencyWeight * planUrgency;

    if (!prereqOk) {
      priority *= PRIORITY_V1.prerequisitePenalty;
    }

    // Phase adjustments: near exam boost reviews & weak high-weight; deprioritize new low-weight.
    if (phase === "cram") {
      if (reviewDue) priority *= 1.4;
      if ((m.mastery ?? 0) < 0.5 && importance >= 0.9) priority *= 1.35;
      if ((m.mastery ?? 0) >= 0.75 && importance < 0.5) priority *= 0.45;
      if ((m.mastery ?? 0) < 0.25 && importance < 0.5) priority *= 0.55;
    } else if (phase === "mixed") {
      if ((m.mastery ?? 0) < 0.55) priority *= 1.2;
      if (reviewDue) priority *= 1.15;
    }

    let reason: TopicCandidate["reason"] = "low_mastery";
    if (reviewDue) reason = "review_due";
    else if (!prereqOk) reason = "prerequisite_blocked";
    else if (planUrgency) reason = "plan";
    else if (importance >= 0.9) reason = "high_importance";

    scored.push({
      topicId: g.topicId,
      topicKey: g.topicKey,
      title: g.title,
      priority,
      reason,
    });
  }

  scored.sort((a, b) => b.priority - a.priority);
  return scored.slice(0, PRIORITY_V1.maxCandidates);
}
