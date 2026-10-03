import { describe, expect, it } from "vitest";
import { layoutBoard } from "@/lib/learning/lesson-board";
import { reviewQuestionFor } from "@/lib/learning/teacher-brain";

describe("lesson part repair", () => {

  it("splits a glued worked example into Veri and Adım lines", () => {
    const lines = layoutBoard(
      "x = m_buhar / m_toplam Veri: m_buhar = 2 kg Adım 1: Kalite hesaplama Adım 2: Sonucu hesapla",
    );
    expect(lines.some((line) => line.text.startsWith("Veri:"))).toBe(true);
    expect(lines.some((line) => /^Adım\s*1/i.test(line.text))).toBe(true);
    expect(lines.some((line) => /^Adım\s*2/i.test(line.text))).toBe(true);
  });

  it("rephrases a missed multiple-choice stem and moves the options", () => {
    const retry = reviewQuestionFor({
      type: "mcq",
      prompt: "Sınırından kütle geçen düzeneğe ne denir?",
      options: ["Kapalı sistem", "Açık sistem", "Yalıtılmış sistem"],
      answerIndex: 1,
      explanation: "Kütle geçişi olan düzenek açık sistemdir.",
    });
    expect(retry.prompt).toBe("Kütle geçişi olan düzenek hangisi?");
    expect(retry.options[retry.answerIndex]).toBe("Açık sistem");
    expect(retry.options).not.toEqual(["Kapalı sistem", "Açık sistem", "Yalıtılmış sistem"]);
  });
});
