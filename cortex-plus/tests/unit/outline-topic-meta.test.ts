import { describe, expect, it } from "vitest";
import {
  packTopicPerspective,
  unpackTopicPerspective,
  isHighExamWeight,
  examWeightToEmphasis,
} from "@/lib/documents/outline-topic-meta";

describe("outline-topic-meta pack/unpack", () => {
  it("round-trips teacher+student fields through existing columns", () => {
    const packed = packTopicPerspective({
      examWeight: "high",
      likelyAsked: ["Madde 2", "İstisna halleri"],
      whyLearn: "Bu konuda istisnaları ayırt edeceksin.",
      prerequisiteTitles: ["Temel Kavramlar"],
    });
    expect(packed.learning_objective).toMatch(/istisna/i);
    expect(packed.key_definitions).toHaveLength(2);
    expect(packed.prerequisites).toEqual(["Temel Kavramlar"]);
    expect(packed.key_relations[0]).toBe("exam_weight:high");

    const unpacked = unpackTopicPerspective(packed);
    expect(unpacked.examWeight).toBe("high");
    expect(isHighExamWeight(unpacked.examWeight)).toBe(true);
    expect(unpacked.likelyAsked).toEqual(["Madde 2", "İstisna halleri"]);
    expect(unpacked.whyLearn).toMatch(/istisna/i);
    expect(unpacked.prerequisiteTitles).toEqual(["Temel Kavramlar"]);
    expect(examWeightToEmphasis("high")).toBe("core");
    expect(examWeightToEmphasis("low")).toBe("skim");
  });

  it("prefers optional migration columns when present", () => {
    const unpacked = unpackTopicPerspective({
      learning_objective: "from packed",
      prerequisites: [],
      key_definitions: ["packed point"],
      key_relations: ["exam_weight:low"],
      exam_weight: "high",
      likely_asked: ["from column"],
    });
    expect(unpacked.examWeight).toBe("high");
    expect(unpacked.likelyAsked).toEqual(["from column"]);
  });
});
