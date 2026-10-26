import { describe, expect, it } from "vitest";
import { itemValidity } from "@/lib/learning/item-validity";
import { deterministicFactConflicts } from "@/lib/learning/oral-fact-check";
import { gradeDeterministicItem, gradeOpenItem, scoreFromItems } from "@/lib/learning/mock-exam/grade";
import { derivationQuestion, gradeSolution, type SolutionPlan } from "@/lib/learning/solution-plan";
import math from "../fixtures/subjects/math-7.json";
import history from "../fixtures/subjects/history-10.json";
import circuit from "../fixtures/subjects/circuit-uni.json";
import kpss from "../fixtures/subjects/kpss-citizenship.json";
import chemistry from "../fixtures/subjects/chemistry.json";
import english from "../fixtures/subjects/english-grammar.json";

const materials = [math, history, circuit, kpss, chemistry, english];

describe("adım adım kısmi puan", () => {
  const derived = derivationQuestion("Kenar 3 cm. Diğer kenar 8 cm. Sonuç 24 cm.", "tr");
  const plan = derived?.plan as SolutionPlan;

  it("doğru yöntem ve son adım kayması kısmi puandır", () => {
    expect(derived).not.toBeNull();
    const slip = gradeSolution("3*8=20", plan, 10, "open");
    expect(slip.verdict).toBe("kismen");
    expect(slip.earned).toBeGreaterThan(0);
    expect(slip.earned).toBeLessThan(10);
    expect(gradeSolution("3 × 8 = 24", plan, 10, "open").earned).toBe(10);
    expect(gradeSolution("24", plan, 10, "open").earned).toBe(5);
    expect(gradeSolution("24", plan, 10, "mcq").earned).toBe(10);
    expect(gradeSolution("5+5=10", plan, 10, "open").earned).toBe(0);
    expect(gradeSolution("", plan, 10, "open")).toEqual({ earned: 0, verdict: "bos" });
  });

  it("aynı nicelik çarpımı olan kaynakta plan çıkar, diğerlerinde çıkmaz", () => {
    const mathPlan = derivationQuestion(math.material, "tr");
    expect(mathPlan?.value).toBe(24);
    expect(mathPlan?.plan.steps[0]?.formula).toBe("3*8");
    expect(derivationQuestion(history.material, "tr")).toBeNull();
    expect(derivationQuestion(circuit.material, "tr")).toBeNull();
    expect(derivationQuestion(kpss.material, "tr")).toBeNull();
    expect(derivationQuestion(chemistry.material, "tr")).toBeNull();
    expect(derivationQuestion(english.material, "en")).toBeNull();
  });

  it("sayısal öğe plansız kapıdan geçmez; geçerli plan geçer", () => {
    expect(itemValidity({ kind: "numeric", text: "Sonucun sayısal değeri nedir bu adımda?" }).issues).toContain("missing_plan");
    expect(
      itemValidity({
        kind: "open",
        text: "3 × 8 işleminin sonucunu adımlarıyla yaz.",
        plan,
      }).issues,
    ).not.toContain("missing_plan");
    expect(
      itemValidity({
        kind: "open",
        text: "3 × 8 işleminin sonucunu adımlarıyla yaz.",
        plan: { steps: [], finalOnlyShare: 0.5 },
      }).issues,
    ).toContain("missing_plan");
  });

  it("puan toplamı notun payıdır ve aynı cevap aynı notu verir", () => {
    const open = {
      id: "open",
      type: "open" as const,
      correctAnswers: [],
      points: 10,
      solutionPlan: plan,
      modelAnswer: derived?.modelAnswer,
      topicLabel: "Konu",
    };
    const slip = gradeOpenItem(open, "3*8=20");
    const again = gradeOpenItem(open, "3*8=20");
    const choice = gradeDeterministicItem(
      { id: "mcq", type: "mcq", correctAnswers: ["A"], points: 5, topicLabel: "Konu" },
      "A",
    );
    const blank = gradeOpenItem(
      {
        id: "blank",
        type: "open",
        correctAnswers: [],
        points: 10,
        rubric: [
          { criterion: "ölçü sabit kalır", points: 5 },
          { criterion: "hariç durum üç gün değişmez", points: 5 },
        ],
        topicLabel: "Konu",
      },
      "",
    );
    const items = [slip, choice, blank];
    const scored = scoreFromItems(items);
    expect(again.pointsEarned).toBe(slip.pointsEarned);
    expect(again.verdict).toBe(slip.verdict);
    expect(scored.earned).toBe(items.reduce((sum, item) => sum + item.pointsEarned, 0));
    expect(scored.scorePct).toBe(Math.round((scored.earned / scored.max) * 100));
    for (const item of items) {
      expect(item.pointsEarned).toBeGreaterThanOrEqual(0);
      expect(item.pointsEarned).toBeLessThanOrEqual(item.pointsMax);
    }
    expect(blank.pointsEarned).toBe(0);
    expect(blank.verdict).toBe("bos");
    expect(JSON.stringify(slip.feedback ?? {})).not.toMatch(/ana nokta/i);
  });
});

describe("altı ders hızı", () => {
  it("p95 altı derste 50 ms altındadır", () => {
    const samples: number[] = [];
    for (let round = 0; round < 30; round += 1) {
      const start = performance.now();
      for (const subject of materials) {
        derivationQuestion(subject.material, subject.language === "en" ? "en" : "tr");
        for (const answer of subject.checks.accept) {
          deterministicFactConflicts(subject.checks.source, [{ index: 0, answer }]);
        }
      }
      samples.push(performance.now() - start);
    }
    samples.sort((left, right) => left - right);
    const p95 = samples[Math.floor(samples.length * 0.95)] ?? samples[samples.length - 1] ?? 0;
    console.info(JSON.stringify({ event: "fair_grade_p95_ms", p95: Math.round(p95 * 1000) / 1000, n: samples.length }));
    expect(p95).toBeLessThan(50);
  });
});
