import { describe, expect, it } from "vitest";
import {
  ensureThreeChecks,
  exampleIsComplete,
  polishWorkedExample,
  scopeLessonToTopic,
  workedExampleNeedsFormula,
} from "@/lib/learning/lesson-repair";
import { retryStemBroken, reviewQuestionFor } from "@/lib/learning/teacher-brain";
import type { LessonV2 } from "@/lib/learning/teaching-standards";

const TOPIC = "Isı ve İş Etkileşimleri";
const MODEL_TITLE = "Enerji Transferi: Isı ve İşin Tanımı ile İşaret Kuralı";
const PROMPT = "Bir sistem 10 kJ ısı kaybedip 4 kJ iş girdisi alırsa net enerji değişimi ____ olur.";
const EXPLANATION =
  "Net enerji değişimi ΔE = Q - W ile hesaplanır. Q = -10 kJ (ısı kaybı), W = -4 kJ (iş girişi), ΔE = -10 - (-4) = -6 kJ olur. Diğer seçenekler işaret kuralı hatasıdır.";
const LEAKED =
  "Net enerji değişimi ΔE = Q - W ile hesaplanır. Q = -10 kJ (ısı kaybı), W = -4 kJ (iş girişi), ΔE = -10 - (-4) = hangisi olur. Diğer seçenekler işaret kuralı hatasıdır?";
const BARE = "W=1×0.287×300×ln2 ≈ 59.7 kJ";
const POLISHED = "W = mRT ln(V₂/V₁) = (1 kg)(0.287 kJ/kg·K)(300 K) ln 2 ≈ 59.7 kJ";
const FORMULA =
  "İzotermal ideal gaz işi W = mRT ln(V₂/V₁) eşitliğiyle yazılır. R = 0.287 kJ/kg·K. Kütle 1 kg. Sıcaklık 300 K.";
const OPTIONS = ["-6 kJ", "14 kJ", "-14 kJ", "6 kJ"];

describe("heat and work retry stem", () => {
  it("rejects a stem that pastes the solution", () => {
    expect(retryStemBroken(LEAKED, EXPLANATION)).toBe(true);
    expect(retryStemBroken("ΔE = -10 - (-4) =")).toBe(true);
    expect(retryStemBroken("ΔE = -10 - (-4) = hangisi olur?")).toBe(true);
    expect(retryStemBroken("Diğer seçenekler işaret kuralı hatasıdır?")).toBe(true);
    expect(retryStemBroken("Bu formüller iş hesabını sağlar?")).toBe(true);
    expect(retryStemBroken("Kütle geçişi olan düzenek hangisi?")).toBe(false);
    expect(retryStemBroken("Isı ve iş sınırdan geçen enerji türleridir. Doğru mu, yanlış mı?")).toBe(false);
  });

  it("asks the energy change again without the arithmetic", () => {
    const retry = reviewQuestionFor(
      {
        type: "mcq",
        prompt: PROMPT,
        options: OPTIONS,
        answerIndex: 0,
        explanation: EXPLANATION,
        review: { prompt: LEAKED },
      },
      "tr",
    );
    expect(retry.prompt).toBe("10 kJ ve 4 kJ verildiğinde net enerji değişimi kaç kJ olur?");
    expect(retry.prompt).not.toMatch(/=\s*hangisi|diğer seçenek|ΔE = -10/);
    expect(retry.options[retry.answerIndex]).toBe("-6 kJ");
    expect(retry.options).not.toEqual(OPTIONS);
  });
});

describe("isothermal worked example", () => {
  it("writes the formula, the substitution with units, then the result", () => {
    expect(exampleIsComplete(BARE)).toBe(false);
    expect(workedExampleNeedsFormula(BARE)).toBe(true);
    expect(polishWorkedExample(BARE, FORMULA)).toBe(POLISHED);
    expect(exampleIsComplete(POLISHED)).toBe(true);
    expect(workedExampleNeedsFormula(POLISHED)).toBe(false);
    expect(polishWorkedExample(BARE, "Bu derste formül yok.")).toBeNull();
    expect(polishWorkedExample(POLISHED, FORMULA)).toBe(POLISHED);
  });
});

describe("scoped heat and work lesson", () => {
  it("uses the clicked title and drops the vague yes/no", () => {
    const lesson: LessonV2 = {
      title: MODEL_TITLE,
      overview: "Isı ve iş, sınırdan geçen enerji türleridir ve sistemin enerjisini değiştirir.",
      sections: [
        {
          heading: MODEL_TITLE,
          body: "Isı, sıcaklık farkından dolayı sınırdan geçen enerjidir. İş, sınırdaki kuvvetin enerji aktarımıdır.",
          check: {
            type: "mcq",
            prompt: PROMPT,
            options: OPTIONS,
            answerIndex: 0,
            explanation: EXPLANATION,
          },
        },
        {
          heading: "Bu formüller, işlem türüne",
          body: `Bu formüller, işlem türüne uygun iş hesabı yapmayı sağlar. ${FORMULA}`,
          check: {
            type: "trueFalse",
            prompt: "Bu formüller, işlem türüne uygun iş hesabı yapmayı sağlar Bu ifade doğru mudur?",
            options: ["Doğru", "Yanlış"],
            answerIndex: 0,
            explanation: "Bu formüller, işlem türüne uygun iş hesabı yapmayı sağlar.",
          },
        },
        {
          heading: "İzokorik süreç",
          body: "İzokorik süreçte hacim sabittir ve sınır işi sıfırdır. Elektrik veya karıştırıcı işi olabilir.",
          check: {
            type: "mcq",
            prompt: "İzokorik bir süreçte sınır işi için hangisi doğrudur?",
            options: [
              "Hacim sabit olduğu için sınır işi sıfırdır.",
              "Sınır işi sıcaklık farkına eşittir.",
              "Sınır işi her zaman elektrik işine eşittir.",
              "Sınır işi kütleyle doğru orantılıdır.",
            ],
            answerIndex: 0,
            explanation: "İzokorik süreçte sınır işi sıfırdır; elektrik veya karıştırıcı işi olabilir.",
          },
        },
      ],
      example: {
        prompt: "1 kg ideal gaz 300 K sıcaklıkta izotermal olarak hacmi iki katına çıkıyor.",
        solution: BARE,
      },
    };
    const scoped = scopeLessonToTopic(lesson, FORMULA, TOPIC);
    expect(scoped.title).toBe(TOPIC);
    expect(scoped.sections.map((section) => section.heading)).not.toContain("Bu formüller, işlem türüne");
    expect(scoped.sections.map((section) => section.heading)).not.toContain(MODEL_TITLE);
    expect(scoped.sections[2]?.heading).toBe("İzokorik süreç");
    expect(JSON.stringify(scoped)).not.toContain("Bu ifade doğru mudur");
    expect(scoped.example?.solution).toBe(POLISHED);
    expect(scoped.example?.prompt).toContain("R = 0.287 kJ/kg·K");
    const filled = ensureThreeChecks(scoped);
    const prompts = filled.sections.map((section) => section.check?.prompt ?? "");
    const formula = filled.sections
      .map((section) => section.check)
      .find((check) => /mRT ln\(V₂\/V₁\)/.test(check?.options?.join(" ") ?? ""));
    expect(formula?.prompt).toMatch(/bağıntı|eşitlik|hangi/i);
    expect(formula?.options).toHaveLength(4);
    expect(prompts.some((prompt) => /bu ifade doğru mudur/i.test(prompt))).toBe(false);
  });
});
