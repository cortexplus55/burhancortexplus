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
  origin: "document" | "curriculum";
};

const WEIGHT_PREFIX = "exam_weight:";
const COURSE_PREFIX = "course:";
const ORIGIN_PREFIX = "origin:";

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

/**
 * Belgelerin ortak kurs etiketi (Paket I, 30 Ekim 2026): düğümü olan her belgenin bir ünitesi aynı kursu
 * taşıyorsa o kurs. Etiket eskiden yalnız "listedeki ilk belge"yle karşılaştırılıyordu; ilk belge
 * kurulumdan çıkarılınca kalan belgelerin haritası kurs sayılmıyor, bütün harita sıfırdan yazılıyordu.
 * Aynı kursun alt kümesi o kursun sırasıyla okunur. Düğümü olmayan belge (konusu başka dosyada kalan
 * fotoğraf) karara katılmaz; hiçbir belgenin düğümü yoksa null.
 */
export function sharedCourseTag(
  perDoc: readonly (readonly { parent_id: string | null; key_relations: unknown }[])[],
): string | null {
  const tagsOf = (nodes: readonly { parent_id: string | null; key_relations: unknown }[]) =>
    new Set(
      nodes
        .filter((node) => node.parent_id == null)
        .map((node) => readCourseFromRelations(node.key_relations))
        .filter((tag): tag is string => Boolean(tag)),
    );
  const withNodes = perDoc.filter((nodes) => nodes.length);
  if (!withNodes.length) return null;
  const [first, ...rest] = withNodes.map(tagsOf);
  for (const tag of first ?? []) {
    if (rest.every((tags) => tags.has(tag))) return tag;
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
  origin?: "document" | "curriculum" | null;
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
  const origin = input.origin === "curriculum" ? "curriculum" : "document";
  return {
    learning_objective: why,
    prerequisites: prereqs,
    key_definitions: likely,
    key_relations: [packExamWeightRelation(weight), `${ORIGIN_PREFIX}${origin}`],
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
    origin: readOriginFromRelations(row.key_relations),
  };
}

export function readOriginFromRelations(relations: unknown): "document" | "curriculum" {
  if (!Array.isArray(relations)) return "document";
  for (const item of relations) {
    if (typeof item === "string" && item.startsWith(ORIGIN_PREFIX) && item.slice(ORIGIN_PREFIX.length) === "curriculum") {
      return "curriculum";
    }
  }
  return "document";
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
