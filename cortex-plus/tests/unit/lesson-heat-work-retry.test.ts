import { describe, expect, it } from "vitest";
import { retryStemBroken, reviewQuestionFor } from "@/lib/learning/teacher-brain";
const PROMPT = "Bir sistem 10 kJ ısı kaybedip 4 kJ iş girdisi alırsa net enerji değişimi ____ olur.";
const EXPLANATION =
  "Net enerji değişimi ΔE = Q - W ile hesaplanır. Q = -10 kJ (ısı kaybı), W = -4 kJ (iş girişi), ΔE = -10 - (-4) = -6 kJ olur. Diğer seçenekler işaret kuralı hatasıdır.";
const LEAKED =
  "Net enerji değişimi ΔE = Q - W ile hesaplanır. Q = -10 kJ (ısı kaybı), W = -4 kJ (iş girişi), ΔE = -10 - (-4) = hangisi olur. Diğer seçenekler işaret kuralı hatasıdır?";
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
