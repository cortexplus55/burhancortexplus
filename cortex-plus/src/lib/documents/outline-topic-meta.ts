/**
 * Pack/unpack teacher+student outline perspective into existing
 * document_topic_nodes columns so no migration is required.
 *
 * Mapping:
 * - learning_objective ← student why/what-you-will-learn (one sentence)
 * - prerequisites      ← prerequisite topic titles (study order)
 * - key_definitions    ← sinavda_sorulabilecekler (2–4 short points)
 * - key_relations      ← ["exam_weight:high|medium|low", ...]
 */

export type ExamWeight = "high" | "medium" | "low";

export type OutlineTopicPerspective = {
  examWeight: ExamWeight;
  likelyAsked: string[];
  whyLearn: string | null;
  prerequisiteTitles: string[];
};

const WEIGHT_PREFIX = "exam_weight:";
const COURSE_PREFIX = "course:";

/** Unit nodes of one course outline share this tag across its documents. */
export function packCourseRelation(courseId: string): string {
  return `${COURSE_PREFIX}${courseId}`;
}

export function readCourseFromRelations(relations: unknown): string | null {
  if (!Array.isArray(relations)) return null;
  for (const item of relations) {
    if (typeof item === "string" && item.startsWith(COURSE_PREFIX)) {
      return item.slice(COURSE_PREFIX.length) || null;
    }
  }
  return null;
}

export function normalizeExamWeight(value: unknown): ExamWeight {
  const raw = String(value ?? "")
    .trim()
    .toLocaleLowerCase("tr");
  if (raw === "high" || raw === "yuksek" || raw === "yüksek") return "high";
  if (raw === "low" || raw === "dusuk" || raw === "düşük") return "low";
  return "medium";
}

export function packExamWeightRelation(weight: ExamWeight): string {
  return `${WEIGHT_PREFIX}${weight}`;
}

export function readExamWeightFromRelations(relations: unknown): ExamWeight | null {
  if (!Array.isArray(relations)) return null;
  for (const item of relations) {
    if (typeof item !== "string") continue;
    if (item.startsWith(WEIGHT_PREFIX)) {
      return normalizeExamWeight(item.slice(WEIGHT_PREFIX.length));
    }
  }
  return null;
}

export function packTopicPerspective(input: {
  examWeight?: ExamWeight | null;
  likelyAsked?: string[] | null;
  whyLearn?: string | null;
  prerequisiteTitles?: string[] | null;
}): {
  learning_objective: string | null;
  prerequisites: string[];
  key_definitions: string[];
  key_relations: string[];
} {
  const why = (input.whyLearn ?? "").trim().slice(0, 400) || null;
  const likely = [...new Set((input.likelyAsked ?? []).map((s) => s.trim()).filter(Boolean))].slice(
    0,
    4,
  );
  const prereqs = [
    ...new Set((input.prerequisiteTitles ?? []).map((s) => s.trim()).filter(Boolean)),
  ].slice(0, 8);
  const weight = normalizeExamWeight(input.examWeight ?? "medium");
  return {
    learning_objective: why,
    prerequisites: prereqs,
    key_definitions: likely,
    key_relations: [packExamWeightRelation(weight)],
  };
}

export function unpackTopicPerspective(row: {
  learning_objective?: string | null;
  prerequisites?: unknown;
  key_definitions?: unknown;
  key_relations?: unknown;
}): OutlineTopicPerspective {
  const likelyFromDefs = Array.isArray(row.key_definitions)
    ? row.key_definitions.filter((s): s is string => typeof s === "string")
    : [];
  const prereqs = Array.isArray(row.prerequisites)
    ? row.prerequisites.filter((s): s is string => typeof s === "string")
    : [];
  return {
    examWeight: readExamWeightFromRelations(row.key_relations) ?? "medium",
    likelyAsked: likelyFromDefs
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 4),
    whyLearn: (row.learning_objective ?? "").trim() || null,
    prerequisiteTitles: prereqs.map((s) => s.trim()).filter(Boolean).slice(0, 8),
  };
}

export function examWeightToEmphasis(
  weight: ExamWeight,
): "core" | "support" | "skim" {
  if (weight === "high") return "core";
  if (weight === "low") return "skim";
  return "support";
}

export function isHighExamWeight(weight: ExamWeight | null | undefined): boolean {
  return weight === "high";
}
