/**
 * Konu başına soru dağılımı — en büyük kalan (Hare) yöntemi.
 * Soru sayısı yetiyorsa her kapsam içi konuya en az 1 soru; kapsam dışı 0. Toplam hep seçilen sayı (30 Ekim 2026).
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
    officialCount: null,
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
 * Konu sayısı soru sayısını aşınca hangi konular sorulur (30 Ekim 2026, Paket I #4). Önce sınav ağırlığı yüksek olanlar
 * (`examHeavy`, sonra `weightPercent` büyükten küçüğe); kalan yerler ağırlığı olmayan konulara listenin başından sonuna
 * eşit aralıkla yayılır (baştaki konulara yığılmasın). Seçilenler belge sırasında döner. Sözlü "Tüm sınav" da bunu okur.
 */
export function pickTopicsForCount<T>(
  topics: readonly T[],
  count: number,
  weightOf: (topic: T) => { percent: number | null; heavy: boolean } = () => ({ percent: null, heavy: false }),
): T[] {
  const want = Math.max(1, Math.floor(count));
  if (topics.length <= want) return [...topics];
  const ranked = topics
    .map((topic, index) => ({ index, weight: weightOf(topic) }))
    .filter((row) => row.weight.heavy || (row.weight.percent != null && row.weight.percent > 0))
    .sort(
      (a, b) =>
        Number(b.weight.heavy) - Number(a.weight.heavy) ||
        (b.weight.percent ?? 0) - (a.weight.percent ?? 0) ||
        a.index - b.index,
    )
    .slice(0, want)
    .map((row) => row.index);
  const picked = new Set(ranked);
  const rest = topics.map((_, index) => index).filter((index) => !picked.has(index));
  const slots = want - picked.size;
  if (slots > 0 && rest.length) {
    if (slots === 1) picked.add(rest[0]!);
    else {
      for (let i = 0; i < slots; i += 1) {
        picked.add(rest[Math.round((i * (rest.length - 1)) / (slots - 1))]!);
      }
    }
    // Yuvarlama iki kez aynı konuyu seçtiyse boşluğu sıradaki seçilmemiş konu doldurur.
    for (const index of rest) {
      if (picked.size >= want) break;
      picked.add(index);
    }
  }
  return topics.filter((_, index) => picked.has(index));
}

/**
 * Kurulumda öğrenciye gösterilen dağılım = üretimin teslim ettiği dağılım (28 Ekim 2026, Paket A).
 * Ağırlık yalnız kayıttaki sınav ağırlığı (`weightPercent`); yoksa konular eşit. Konu metninin uzunluğu
 * (`passageChars`) dağılıma girmez: önizleme onu bilmiyordu, üretim biliyordu — Selin'in kurulumu 3+3+3+3+2+2+2+2
 * dedi, deneme K1'e 5, K2'ye 1 soru verdi. Soru sayısı yetiyorsa her kapsam içi konu en az 1 soru alır.
 *
 * 30 Ekim 2026 (Paket I #4): toplam HER ZAMAN seçilen sayıdır. Eskiden konu fazlaysa toplam konu sayısına büyüyordu;
 * 22 konulu hazırlıkta "Kısa" da "Standart" da 22 soru çıktı, öğrenci kısa deneme alamadı. Artık konular
 * `pickTopicsForCount` ile seçilir (ağırlık önce, kalanlar yayılarak) ve kurulum hangisinin sorulmadığını söyler.
 */
export function allocateQuestions(topics: MockTopicSlot[], totalQuestions: number): AllocationRow[] {
  const allInScope = topics.filter((t) => !t.outOfScope && t.topicLabel.trim());
  if (!allInScope.length || totalQuestions < 1) return [];
  const total = Math.floor(totalQuestions);
  // Resmî tablo (ör. MEB ortak yazılı senaryosu) toplamı seçilen sayıya eşitse konu başı sayılar aynen; 0 alan konu sorulmaz.
  const official = allInScope.filter((t) => (t.officialCount ?? 0) > 0);
  if (official.length && official.reduce((sum, t) => sum + Math.floor(t.officialCount ?? 0), 0) === total) {
    return official.map((topic) => ({
      topicId: topic.topicId,
      topicLabel: topic.topicLabel,
      count: Math.floor(topic.officialCount ?? 0),
      weightPercent: topic.weightPercent,
      examHeavy: topic.examHeavy,
    }));
  }
  const inScope = pickTopicsForCount(allInScope, total, (topic) => ({
    percent: topic.weightPercent,
    heavy: topic.examHeavy,
  }));

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
  /** Teslim edilecek toplam: konu başı sayıların toplamı (= seçilen sayı). */
  total: number;
  /** Öğrencinin seçtiği uzunluğun sayısı. */
  chosen: number;
  /** Eski alan: toplam artık büyümez, hep false (30 Ekim 2026). */
  expanded: boolean;
  /** Soru alan konu sayısı. */
  topicCount: number;
  /** Kapsam içindeki bütün konular. */
  scopeTopicCount: number;
  /** Bu uzunlukta soru almayan konular (belge sırasıyla). */
  skippedTopics: string[];
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
  const scope = topics.filter((t) => !t.outOfScope && t.topicLabel.trim());
  const asked = new Set(rows.map((row) => `${row.topicId ?? ""}:${row.topicLabel}`));
  const skippedTopics = scope.filter((t) => !asked.has(`${t.topicId ?? ""}:${t.topicLabel}`)).map((t) => t.topicLabel);
  return {
    rows,
    total,
    chosen: questionCount,
    expanded: false,
    topicCount: rows.length,
    scopeTopicCount: scope.length,
    skippedTopics,
  };
}

/** Konu soru sayısından fazlaysa kurulumun söylediği cümle; değilse null. */
export function expandedAllocationNote(
  promised: Pick<PromisedAllocation, "topicCount" | "scopeTopicCount" | "skippedTopics">,
): string | null {
  if (!promised.skippedTopics.length) return null;
  return `${promised.scopeTopicCount} konudan ${promised.topicCount} tanesi soruluyor: sınav ağırlığı yüksek olanlar önce, kalanlar listeye yayılarak. Bütün konular için soru sayısını artır.`;
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
  // Dağıtım toplamı söz verilen sayıdır (30 Ekim 2026'dan beri konu fazlaysa da büyümez); tür karışımı bu sayıya göre.
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
