/**
 * Konu başına soru dağılımı — en büyük kalan (Hare) yöntemi.
 * Her kapsam içi konuya en az 1 soru; kapsam dışı 0.
 */

import type { MockExamBlueprint, MockTopicSlot } from "@/lib/learning/mock-exam/types";
import { presetPlan, type ParsedExamFormat } from "@/lib/learning/mock-exam/blueprint";
import type { MockLengthPreset } from "@/lib/learning/mock-exam/types";

/** Kaynak kaydındaki sınav ağırlığı. Kurulum önizlemesi ve üretim aynı fonksiyonu okur. */
export function weightFromTopicRefs(raw: unknown): { percent: number | null; heavy: boolean } | null {
  if (!raw || typeof raw !== "object") return null;
  const list = Array.isArray(raw) ? raw : [raw];
  for (const item of list) {
    if (item && typeof item === "object" && "weightPercent" in item) {
      const percent = Number((item as { weightPercent?: unknown }).weightPercent);
      return {
        percent: Number.isFinite(percent) ? percent : null,
        heavy: Boolean((item as { examHeavy?: unknown }).examHeavy),
      };
    }
  }
  return null;
}

/** Duyurulan kota ile üretim aynı slottan başlar. */
export function slotFromTopicRow(row: {
  id: string;
  label: string;
  sourceRefs?: unknown;
  passageChars?: number;
}): MockTopicSlot {
  const weight = weightFromTopicRefs(row.sourceRefs);
  return {
    topicId: row.id === "studio" ? null : row.id,
    topicLabel: row.label,
    weightPercent: weight?.percent ?? null,
    examHeavy: weight?.heavy ?? false,
    outOfScope: false,
    passageChars: row.passageChars && row.passageChars > 0 ? row.passageChars : 100,
  };
}

export function allocateQuestions(
  topics: MockTopicSlot[],
  totalQuestions: number,
): Array<{
  topicId: string | null;
  topicLabel: string;
  count: number;
  weightPercent: number | null;
  examHeavy: boolean;
}> {
  const inScope = topics.filter((t) => !t.outOfScope && t.topicLabel.trim());
  if (!inScope.length || totalQuestions < 1) return [];

  // Her konuya 1 soru rezervi
  const reserved = Math.min(inScope.length, totalQuestions);
  const remaining = totalQuestions - reserved;

  const hasWeights = inScope.some((t) => t.weightPercent != null && t.weightPercent > 0);
  const weights = inScope.map((t) => {
    if (hasWeights) return Math.max(0, t.weightPercent ?? 0);
    return Math.max(1, t.passageChars);
  });
  const weightSum = weights.reduce((a, b) => a + b, 0) || inScope.length;

  const exact = weights.map((w) => (remaining * w) / weightSum);
  const floors = exact.map((x) => Math.floor(x));
  let used = floors.reduce((a, b) => a + b, 0);
  const remainders = exact
    .map((x, i) => ({ i, frac: x - floors[i] }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  const extra = [...floors];
  let cursor = 0;
  while (used < remaining && cursor < remainders.length) {
    extra[remainders[cursor].i] += 1;
    used += 1;
    cursor += 1;
  }

  return inScope.map((topic, i) => ({
    topicId: topic.topicId,
    topicLabel: topic.topicLabel,
    count: 1 + (extra[i] ?? 0),
    weightPercent: topic.weightPercent,
    examHeavy: topic.examHeavy,
  }));
}

export function buildBlueprint(input: {
  topics: MockTopicSlot[];
  preset: MockLengthPreset;
  syllabus: ParsedExamFormat | null;
  allowNumeric: boolean;
}): MockExamBlueprint {
  const plan = presetPlan(input.preset, input.syllabus, input.allowNumeric);
  const allocation = allocateQuestions(input.topics, plan.questionCount);
  const allocated = allocation.reduce((sum, row) => sum + row.count, 0);
  // Dağıtım toplamı planı aşmaz; eksikse slots kırpılır
  const questionCount = allocated > 0 ? allocated : plan.questionCount;
  const slots =
    allocated > 0 && allocated !== plan.slots.length
      ? resizeSlots(plan.slots, questionCount)
      : plan.slots.slice(0, questionCount);

  return {
    preset: input.preset,
    questionCount,
    durationMinutes: plan.durationMinutes,
    slots,
    formatSummary: plan.formatSummary,
    fromSyllabus: plan.fromSyllabus,
    allocation,
    allowNumeric: input.allowNumeric,
  };
}

function resizeSlots(
  slots: MockExamBlueprint["slots"],
  target: number,
): MockExamBlueprint["slots"] {
  if (slots.length === target) return slots;
  if (slots.length > target) return slots.slice(0, target);
  const out = [...slots];
  while (out.length < target) out.push({ type: "mcq", points: 4 });
  return out;
}
