/**
 * Konu başına soru dağılımı — en büyük kalan (Hare) yöntemi.
 * Her kapsam içi konuya en az 1 soru; kapsam dışı 0.
 */

import type { MockExamBlueprint, MockTopicSlot } from "@/lib/learning/mock-exam/types";
import { defaultSlots, presetPlan, type ParsedExamFormat } from "@/lib/learning/mock-exam/blueprint";
import { DEFAULT_SHORT, DEFAULT_STANDARD, type MockLengthPreset } from "@/lib/learning/mock-exam/types";

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

export type AllocationRow = {
  topicId: string | null;
  topicLabel: string;
  count: number;
  weightPercent: number | null;
  examHeavy: boolean;
};

/**
 * Kurulumda öğrenciye gösterilen dağılım = üretimin teslim ettiği dağılım (28 Ekim 2026, Paket A).
 * Ağırlık yalnız kayıttaki sınav ağırlığı (`weightPercent`); yoksa konular eşit. Konu metninin uzunluğu
 * (`passageChars`) dağılıma girmez: önizleme onu bilmiyordu, üretim biliyordu — Selin'in kurulumu 3+3+3+3+2+2+2+2
 * dedi, deneme K1'e 5, K2'ye 1 soru verdi. Her kapsam içi konu en az 1 soru alır; konu sayısı seçilen sayıdan
 * fazlaysa toplam konu sayısı olur ve kurulum bunu baştan söyler (ürün sahibinin kararı).
 */
export function allocateQuestions(topics: MockTopicSlot[], totalQuestions: number): AllocationRow[] {
  const inScope = topics.filter((t) => !t.outOfScope && t.topicLabel.trim());
  if (!inScope.length || totalQuestions < 1) return [];

  const total = Math.max(totalQuestions, inScope.length);
  // Her konuya 1 soru rezervi
  const remaining = total - inScope.length;

  const hasWeights = inScope.some((t) => t.weightPercent != null && t.weightPercent > 0);
  const weights = inScope.map((t) => (hasWeights ? Math.max(0, t.weightPercent ?? 0) : 1));
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

export type PromisedAllocation = {
  rows: AllocationRow[];
  /** Teslim edilecek toplam: konu başı sayıların toplamı. */
  total: number;
  /** Öğrencinin seçtiği uzunluğun sayısı. */
  chosen: number;
  /** Konu sayısı seçilen sayıyı aştı; her konudan 1 soruyla toplam büyüdü. */
  expanded: boolean;
  topicCount: number;
};

/** Uzunluk seçeneğinin soru sayısı ("Gerçek sınav biçimi" belgedeki biçimin sayısı). */
export function presetQuestionCount(preset: MockLengthPreset, realQuestionCount: number | null): number {
  if (preset === "real" && realQuestionCount && realQuestionCount > 0) return realQuestionCount;
  return preset === "short" ? DEFAULT_SHORT.questionCount : DEFAULT_STANDARD.questionCount;
}

/** Kurulum ekranı ve üretim yalnız bunu okur: aynı konular + aynı sayı → aynı dağılım. */
export function promisedAllocation(topics: MockTopicSlot[], questionCount: number): PromisedAllocation {
  const rows = allocateQuestions(topics, questionCount);
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return { rows, total, chosen: questionCount, expanded: total > questionCount, topicCount: rows.length };
}

/** Konu fazlaysa kurulumun söylediği cümle; değilse null. */
export function expandedAllocationNote(promised: Pick<PromisedAllocation, "expanded" | "topicCount" | "total">): string | null {
  if (!promised.expanded) return null;
  return `${promised.topicCount} konu olduğu için her konudan 1 soru (toplam ${promised.total} soru) sorulacak.`;
}

export function buildBlueprint(input: {
  topics: MockTopicSlot[];
  preset: MockLengthPreset;
  syllabus: ParsedExamFormat | null;
  allowNumeric: boolean;
  /** Seçilen soru sayısı (stüdyo); yoksa uzunluk seçeneğinin sayısı. */
  questionCount?: number;
}): MockExamBlueprint {
  const plan = presetPlan(input.preset, input.syllabus, input.allowNumeric);
  const chosen = input.questionCount ?? plan.questionCount;
  const promised = promisedAllocation(input.topics, chosen);
  const allocation = promised.rows;
  const allocated = promised.total;
  // Dağıtım toplamı söz verilen sayıdır: konu fazlaysa büyür, tür karışımı yeni sayıya göre kurulur.
  const questionCount = allocated > 0 ? allocated : chosen;
  const slots = plan.fromSyllabus
    ? resizeSlots(plan.slots, questionCount)
    : defaultSlots(questionCount, input.allowNumeric);

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
