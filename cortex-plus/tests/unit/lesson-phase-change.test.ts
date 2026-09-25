import { describe, expect, it } from "vitest";
import { definitionalInversionIssues, mistakeTeachesInversion } from "@/lib/learning/unit-inversions";
import { groundLearnerLesson } from "@/lib/learning/lesson-grounding";
import { layoutBoard } from "@/lib/learning/lesson-board";
import { reviewQuestionFor } from "@/lib/learning/teacher-brain";

const LIVE_PROMPT = "Aşağıdakilerden hangisi doymuş sıvının tanımına uygundur?";
const LIVE_CORRECT = "Kaynama başlamak üzere olan sıvı";
const VAGUE_MIXTURE = "Doymuş sıvı ve doymuş buhar, sıvı-buhar karışımını belirler.";
const VAGUE_COMPARE = "Faz kararı için sıcaklık ve basınç arasında bir karşılaştırma yapılmalıdır.";

const source = [
  "Doymuş sıvı belirli bir basınçta kaynama başlamak üzere olan sıvıdır.",
  "Doymuş buhar yoğuşmak üzere olan buhardır.",
  "Sıkıştırılmış sıvı T < T_sat(P) koşuludur.",
  "Kızgın buhar T > T_sat(P) koşuludur.",
  "Karışımın bileşimi kuruluk derecesi x ile verilir.",
  "Faz kararı için sıcaklık T_sat(P) ile karşılaştırılır.",
].join(" ");

const saturatedCheck = {
  type: "mcq" as const,
  prompt: LIVE_PROMPT,
  options: [
    LIVE_CORRECT,
    "Yoğuşmak üzere olan buhar",
    "Kızgın buhar",
    "Sıvı-buhar karışımı",
  ],
  answerIndex: 0,
  explanation: "Doymuş sıvı kaynama başlamak üzere olan sıvıdır.",
};

describe("phase-change lesson", () => {
  it("reverses the saturated-liquid definition instead of repeating it", () => {
    const retry = reviewQuestionFor(saturatedCheck, "tr", source);
    expect(retry.prompt).toBe("Kaynama başlamak üzere olan sıvıya ne ad verilir?");
    expect(retry.prompt).not.toBe(LIVE_PROMPT);
    expect(retry.prompt).not.toContain("başka sözcüklerle");
    expect(retry.options[retry.answerIndex]).toBe("Doymuş sıvı");
    expect(retry.options).toEqual(
      expect.arrayContaining(["Doymuş sıvı", "Sıkıştırılmış sıvı", "Doymuş buhar", "Kızgın buhar"]),
    );
    expect(retry.options).not.toContain(LIVE_CORRECT);

    const stored = reviewQuestionFor(
      {
        ...saturatedCheck,
        review: {
          prompt: "Kaynamaya hazır sıvı hangi adı taşır?",
          options: saturatedCheck.options,
          answerIndex: 0,
        },
      },
      "tr",
      source,
    );
    expect(stored.prompt).toBe("Kaynamaya hazır sıvı hangi adı taşır?");
    expect(stored.options[stored.answerIndex]).toBe(LIVE_CORRECT);

    const untouched = reviewQuestionFor(
      {
        type: "mcq",
        prompt: "Sınırından kütle geçen düzeneğe ne denir?",
        options: ["Kapalı sistem", "Açık sistem", "Yalıtılmış sistem"],
        answerIndex: 1,
        explanation: "Kütle geçişi olan düzenek açık sistemdir.",
      },
      "tr",
      "Kapalı sistem kütle geçirmez.",
    );
    expect(untouched.prompt).toBe("Sınırından kütle geçen düzeneğe ne denir?");
    expect(untouched.options[untouched.answerIndex]).toBe("Açık sistem");
  });

  it("flags the live summary sentences and keeps the saturation rules", () => {
    const clean = [
      "Doymuş sıvı kaynama başlamak üzere olan sıvıdır.",
      "Doymuş buhar yoğuşmak üzere olan buhardır.",
      "Sıkıştırılmış sıvı T < T_sat(P) koşuludur.",
      "Kızgın buhar T > T_sat(P) koşuludur.",
      "Sıkıştırılmış sıvı T < T_sat(P) ve kızgın buhar T > T_sat(P) koşuluyla tanımlanır.",
      "Karışımın bileşimi kuruluk derecesi x ile verilir.",
      "Faz kararı için sıcaklık T_sat(P) ile karşılaştırılır.",
      "Doymuş sıvıda x = 0. Doymuş buharda x = 1.",
      "Basınç, P_sat(T) ile karşılaştırılır.",
    ];
    for (const sentence of clean) {
      expect(definitionalInversionIssues(sentence), sentence).toEqual([]);
    }
    for (const sentence of [
      VAGUE_MIXTURE,
      VAGUE_COMPARE,
      "Sıkıştırılmış sıvı T > T_sat(P) bölgesindedir.",
      "Kızgın buhar T < T_sat(P) bölgesindedir.",
      "Doymuş sıvı yoğuşmak üzere olan buhardır.",
      "Doymuş buhar kaynama başlamak üzere olan sıvıdır.",
      "Kızgın buharın bileşimi kuruluk derecesi x ile belirlenir.",
    ]) {
      expect(definitionalInversionIssues(sentence).length, sentence).toBeGreaterThan(0);
    }
    expect(definitionalInversionIssues(VAGUE_MIXTURE).join(" ")).toMatch(/Belirsiz fizik/);
    expect(definitionalInversionIssues(VAGUE_COMPARE).join(" ")).toMatch(/Belirsiz fizik/);
    expect(
      mistakeTeachesInversion(
        VAGUE_COMPARE,
        "Faz kararı için sıcaklık T_sat(P) ile karşılaştırılır.",
      ),
    ).toBe(false);
  });

  it("replaces vague summary lines with the source sentence", () => {
    const grounded = groundLearnerLesson(
      {
        title: "Saf Maddeler ve Faz Değişimi",
        sections: [{ heading: "Saf Maddeler ve Fazlar", body: source }],
        summary: [VAGUE_MIXTURE, VAGUE_COMPARE, "Saf maddenin bileşimi her yerde aynıdır."],
      },
      source,
    );
    const lesson = grounded.lesson as { summary?: string[] };
    const summary = lesson.summary?.join(" ") ?? "";
    expect(grounded.removed.join(" ")).toMatch(/summary:replaced/);
    expect(summary).not.toContain("karışımını belirler");
    expect(summary).not.toContain("sıcaklık ve basınç arasında");
    expect(summary).toMatch(/kuruluk/);
    expect(summary).toMatch(/T_sat/);
    expect(summary).toContain("Saf maddenin bileşimi her yerde aynıdır.");

    const again = groundLearnerLesson(lesson, source);
    expect(again.removed).toEqual([]);
  });

  it("puts saturation relations on their own formula line", () => {
    const lines = layoutBoard(
      "Aynı zamanda, sıkıştırılmış sıvı T < T_sat(P) ve kızgın buhar T > T_sat(P) koşuluyla tanımlanırlar. Kızgın buhar için T > T_sat(P) → kızgın buhar yazılır.",
    );
    const formulas = lines.filter((line) => line.kind === "formula").map((line) => line.text);
    expect(formulas).toContain("T < T_sat(P)");
    expect(formulas).toContain("T > T_sat(P)");
    expect(formulas.some((line) => line.includes("→") && line.includes("T_sat"))).toBe(true);
    expect(lines.some((line) => line.kind === "prose" && line.text.includes("sıkıştırılmış sıvı"))).toBe(
      true,
    );
  });
});
