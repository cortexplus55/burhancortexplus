import { describe, expect, it } from "vitest";
import { acceptChallengeSet, buildChallengeSource } from "@/lib/learning/challenge-set";

const source =
  "Saf suyun kaynama noktası 100 derecedir. Karışımların kaynama noktası saf maddeninkinden farklıdır.";

describe("challenge set", () => {
  it("keeps an application question whose explanation stays inside the source", () => {
    const accepted = acceptChallengeSet(
      {
        questions: [
          {
            text: "Saf su ile bir karışımın kaynama noktası aynı mıdır?",
            options: ["Aynıdır, ikisi de 100 derecedir", "Farklıdır", "İkisi de 0 derecedir"],
            correct: "Farklıdır",
            explanation:
              "Kaynakta karışımların kaynama noktası saf maddeninkinden farklıdır ve saf su 100 derecedir.",
            topic: "Saf madde",
          },
          {
            text: "Kaynakta saf suyun kaynama noktası kaç derecedir?",
            options: ["100 derece", "0 derece"],
            correct: "100 derece",
            explanation: "Kaynak saf suyun kaynama noktasını 100 derece olarak verir.",
          },
          {
            text: "Bu fark ne işe yarar?",
            options: ["Ayırt etmek için", "Sıcaklığı sıfırlamak için"],
            correct: "Ayırt etmek için",
            explanation: "Karışımın kaynama noktası saf maddeninkinden farklı olduğu için ayırt edilir.",
          },
        ],
      },
      source,
    );
    expect(accepted.length).toBeGreaterThanOrEqual(2);
    expect(accepted.every((question) => question.explanation?.includes("100") || question.explanation)).toBe(
      true,
    );
  });

  it("drops an explanation that invents a number the source does not have", () => {
    const accepted = acceptChallengeSet(
      {
        questions: [
          {
            text: "Saf su kaç derecede kaynar?",
            options: ["100 derece", "273 derece"],
            correct: "100 derece",
            explanation: "Kaynama noktası 273 derecedir.",
          },
        ],
      },
      source,
    );
    expect(accepted).toEqual([]);
  });

  it("stops reading the source once the cap is reached", () => {
    const text = buildChallengeSource([
      { pageNumber: 1, text: "a".repeat(9000) },
      { pageNumber: 2, text: "bu sayfa alınmamalı" },
    ]);
    expect(text.length).toBeLessThanOrEqual(8000);
    expect(text).not.toContain("alınmamalı");
  });
});
