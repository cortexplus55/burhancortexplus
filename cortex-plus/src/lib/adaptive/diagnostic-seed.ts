/**
 * Seed continuous Student State from existing diagnostic summaries / topic measured_level.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { seedFromMeasuredLevel } from "@/lib/adaptive/mastery-engine";
import { persistTopicMastery } from "@/lib/adaptive/student-state";
import { loadExamGraph } from "@/lib/adaptive/exam-graph";
import type { MeasuredLevel } from "@/lib/learning/diagnostic";
import { normalizeTopicKey } from "@/lib/learning/learning-tracking";

/**
 * After diagnostic completes, write initial continuous mastery if rows are empty.
 * Idempotent: skips topics that already have evidence_count > 0 or mastery > 0.
 */
export async function seedStudentStateFromDiagnostic(
  service: SupabaseClient,
  userId: string,
  examPrepId: string,
): Promise<{ seeded: number }> {
  const graph = await loadExamGraph(service, examPrepId);
  const { data: existing } = await service
    .from("exam_prep_topic_mastery")
    .select("topic_key, evidence_count, mastery")
    .eq("user_id", userId)
    .eq("exam_prep_id", examPrepId);

  const skip = new Set(
    (existing ?? [])
      .filter(
        (r) =>
          Number(r.evidence_count ?? 0) > 0 || Number(r.mastery ?? 0) > 0,
      )
      .map((r) => normalizeTopicKey(r.topic_key)),
  );

  let seeded = 0;
  for (const t of graph.topics) {
    if (skip.has(t.topicKey)) continue;
    const level = (t.measuredLevel as MeasuredLevel | null) ?? "unknown";
    const state = seedFromMeasuredLevel(t.topicId, t.topicKey, level);
    if (state.evidenceCount === 0 && state.mastery === 0) continue;
    const discrete =
      level === "weak" || level === "emerging" || level === "solid"
        ? level
        : "unmeasured";
    await persistTopicMastery(service, userId, examPrepId, state, discrete);
    seeded += 1;
  }
  return { seeded };
}
