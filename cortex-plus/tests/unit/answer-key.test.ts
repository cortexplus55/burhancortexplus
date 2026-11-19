/**
 * Faz 2 (madde 7.2): geçerli cevap anahtarı olmayan soru kaydedilmez. Kural tek yerde (`answer-key.ts`); her yazma
 * noktası onu çağırır.
 */
import { readFileSync } from "fs";
import { describe, expect, it, vi } from "vitest";
import {
  hasChoiceAnswerKey,
  isValidChoiceIndex,
  keepAnswerKeyed,
  lessonCheckHasAnswerKey,
  mockDraftHasAnswerKey,
  validOptions,
} from "@/lib/learning/answer-key";
import { sectionCheckSchema } from "@/lib/learning/teaching-standards";
import { mockQuestionRows } from "@/lib/learning/mock-exam/create";
import type { MockExamQuestionDraft } from "@/lib/learning/mock-exam/types";

const OPTIONS = ["Seçenek 1", "Seçenek 2", "Seçenek 3", "Seçenek 4"];

describe("şık numarası (correctIndex / answerIndex)", () => {
  it("tam sayı ve şıkların içinde olmalı", () => {
    expect(isValidChoiceIndex(OPTIONS, 0)).toBe(true);
    expect(isValidChoiceIndex(OPTIONS, 3)).toBe(true);
    expect(isValidChoiceIndex(OPTIONS, 4)).toBe(false);
    expect(isValidChoiceIndex(OPTIONS, -1)).toBe(false);
    expect(isValidChoiceIndex(OPTIONS, 1.5)).toBe(false);
    expect(isValidChoiceIndex(OPTIONS, undefined)).toBe(false);
    expect(isValidChoiceIndex(OPTIONS, "1")).toBe(false);
    expect(isValidChoiceIndex(["Tek"], 0)).toBe(false);
  });

  it("şıklar dolu ve farklı olmalı", () => {
    expect(validOptions(["A", "B"])).toBe(true);
    expect(validOptions(["A", " "])).toBe(false);
    expect(validOptions(["A", "A"])).toBe(false);
    expect(validOptions("A,B")).toBe(false);
  });
});

describe("metinle doğru cevap (correctAnswer)", () => {
  it("tek doğru: boş değil ve şıklardan biri", () => {
    expect(hasChoiceAnswerKey(OPTIONS, "Seçenek 2")).toBe(true);
    expect(hasChoiceAnswerKey(OPTIONS, " Seçenek 2 ")).toBe(true);
    expect(hasChoiceAnswerKey(OPTIONS, "Seçenek 9")).toBe(false);
    expect(hasChoiceAnswerKey(OPTIONS, "")).toBe(false);
    expect(hasChoiceAnswerKey(OPTIONS, null)).toBe(false);
    expect(hasChoiceAnswerKey(OPTIONS, ["Seçenek 1", "Seçenek 2"])).toBe(false);
  });

  it("çok doğru: hepsi şıklarda", () => {
    expect(hasChoiceAnswerKey(OPTIONS, ["Seçenek 1", "Seçenek 2"], { multi: true })).toBe(true);
    expect(hasChoiceAnswerKey(OPTIONS, ["Seçenek 1", "Başka"], { multi: true })).toBe(false);
    expect(hasChoiceAnswerKey(OPTIONS, [], { multi: true })).toBe(false);
  });
});

const draft = (patch: Partial<MockExamQuestionDraft>): MockExamQuestionDraft => ({
  text: "Soru kökü",
  type: "mcq",
  options: OPTIONS,
  correctAnswers: ["Seçenek 1"],
  points: 4,
  explanation: "",
  optionWhy: [],
  rubric: [],
  modelAnswer: "",
  topicId: null,
  topicLabel: "Konu",
  source: { documentId: null, page: null, label: "Kaynak" } as unknown as MockExamQuestionDraft["source"],
  difficulty: "medium",
  ...patch,
});

describe("yazılı deneme taslağı", () => {
  it("türüne göre anahtar", () => {
    expect(mockDraftHasAnswerKey(draft({}))).toBe(true);
    expect(mockDraftHasAnswerKey(draft({ correctAnswers: [] }))).toBe(false);
    expect(mockDraftHasAnswerKey(draft({ correctAnswers: ["Yok"] }))).toBe(false);
    expect(mockDraftHasAnswerKey(draft({ type: "multi_mcq", correctAnswers: ["Seçenek 1", "Seçenek 3"] }))).toBe(true);
    expect(mockDraftHasAnswerKey(draft({ type: "true_false", options: ["Doğru", "Yanlış"], correctAnswers: ["Yanlış"] }))).toBe(true);
    expect(mockDraftHasAnswerKey(draft({ type: "true_false", options: ["Doğru", "Yanlış"], correctAnswers: [] }))).toBe(false);
    expect(mockDraftHasAnswerKey(draft({ type: "numeric", options: [], correctAnswers: [], numericExpected: 12 }))).toBe(true);
    expect(mockDraftHasAnswerKey(draft({ type: "numeric", options: [], correctAnswers: [] }))).toBe(false);
    expect(mockDraftHasAnswerKey(draft({ type: "open", options: [], correctAnswers: [], rubric: [{ criterion: "Ölçüt", points: 2 }] }))).toBe(true);
    expect(mockDraftHasAnswerKey(draft({ type: "open", options: [], correctAnswers: [] }))).toBe(false);
    expect(mockDraftHasAnswerKey(draft({ text: " " }))).toBe(false);
  });

  it("kâğıt satırları anahtarsız soruyu taşımaz; her satırın doğru cevabı şıklarda", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const rows = mockQuestionRows("exam", [draft({}), draft({ correctAnswers: [] }), draft({ correctAnswers: ["Yok"] }), draft({ text: "İkinci" })]);
    expect(rows).toHaveLength(2);
    for (const row of rows) expect((row.options ?? []).includes(row.correct_answer as string)).toBe(true);
    expect(warn).toHaveBeenCalledWith("question_dropped_no_answer_key", { site: "mock_exam", dropped: 2, kept: 2 });
    warn.mockRestore();
  });
});

describe("ders içi kontrol", () => {
  it("çoktan seçmeli ve hatayı bul: answerIndex şıkların içinde; sayısal: beklenen sonuç", () => {
    expect(lessonCheckHasAnswerKey({ type: "mcq", options: OPTIONS, answerIndex: 2 })).toBe(true);
    expect(lessonCheckHasAnswerKey({ type: "mcq", options: OPTIONS })).toBe(false);
    expect(lessonCheckHasAnswerKey({ type: "mcq", options: ["A", "B"], answerIndex: 3 })).toBe(false);
    expect(lessonCheckHasAnswerKey({ type: "findError", options: ["A", "B"], answerIndex: 1 })).toBe(true);
    expect(lessonCheckHasAnswerKey({ type: "trueFalse", answerIndex: 1 })).toBe(true);
    expect(lessonCheckHasAnswerKey({ type: "trueFalse" })).toBe(false);
    expect(lessonCheckHasAnswerKey({ type: "numerical", answer: "12 birim" })).toBe(true);
    expect(lessonCheckHasAnswerKey({ type: "numerical" })).toBe(false);
    expect(lessonCheckHasAnswerKey({ type: "explain" })).toBe(true);
  });

  it("şema anahtarsız kontrolü kabul etmez", () => {
    const base = { type: "mcq", prompt: "Kontrol sorusu kökü", options: OPTIONS, explanation: "Gerekçe cümlesi." };
    expect(sectionCheckSchema.safeParse({ ...base, answerIndex: 1 }).success).toBe(true);
    expect(sectionCheckSchema.safeParse(base).success).toBe(false);
    expect(sectionCheckSchema.safeParse({ ...base, answerIndex: 5 }).success).toBe(false);
  });
});

describe("keepAnswerKeyed", () => {
  it("atılan yoksa günlük yok", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(keepAnswerKeyed([1, 2], () => true, "x")).toEqual([1, 2]);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("yazma noktaları kuralı çağırır", () => {
  const read = (path: string) => readFileSync(path, "utf8");
  it("deneme, havuz, stüdyo testi", () => {
    expect(read("src/lib/learning/mock-exam/create.ts")).toContain("keepAnswerKeyed(drafts, mockDraftHasAnswerKey");
    expect(read("src/lib/learning/mock-exam/pool-exam.ts")).toContain("isValidChoiceIndex(item.choices, item.answer)");
    expect(read("src/lib/content-pool/supabase-store.ts")).toContain("isValidChoiceIndex(item.choices, item.answer)");
    expect(read("src/lib/content-pool/reinforce-new.ts")).toContain("isValidChoiceIndex(item.choices, item.answer)");
    expect(read("src/app/api/learning/quiz/generate/route.ts")).toContain("hasChoiceAnswerKey(q.options, q.correct[0])");
  });
});
