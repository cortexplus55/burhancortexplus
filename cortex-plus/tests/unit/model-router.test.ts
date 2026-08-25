import { describe, expect, it } from "vitest";
import { selectModel } from "@/lib/ai/model-router";

const STANDARD = "gpt-4o-mini";
const ADVANCED = "gpt-4o";

describe("model router", () => {
  it("always routes image work to the advanced model", () => {
    const result = selectModel({
      actionCode: "AI_CHAT_STANDARD",
      isPremium: false,
      hasImage: true,
    });
    expect(result.model).toBe(ADVANCED);
    expect(result.actionCode).toBe("IMAGE_SOLUTION");
  });

  it("keeps free chat on the standard model", () => {
    const result = selectModel({
      actionCode: "AI_CHAT_STANDARD",
      isPremium: false,
      hasImage: false,
    });
    expect(result.model).toBe(STANDARD);
    expect(result.actionCode).toBe("AI_CHAT_STANDARD");
  });

  it("honours an explicit advanced request from a premium user", () => {
    const result = selectModel({
      actionCode: "AI_CHAT_ADVANCED",
      isPremium: true,
      hasImage: false,
      userSelectedAdvanced: true,
    });
    expect(result.model).toBe(ADVANCED);
    expect(result.actionCode).toBe("AI_CHAT_ADVANCED");
  });

  it("downgrades an advanced request from a non-premium user", () => {
    const result = selectModel({
      actionCode: "AI_CHAT_ADVANCED",
      isPremium: false,
      hasImage: false,
      userSelectedAdvanced: true,
    });
    expect(result.model).toBe(ADVANCED);
    expect(result.actionCode).toBe("AI_CHAT_ADVANCED");
  });

  it("escalates hard exam grading", () => {
    const result = selectModel({
      actionCode: "PRACTICE_EXAM_GRADE",
      isPremium: false,
      hasImage: false,
      difficulty: "hard",
    });
    expect(result.model).toBe(ADVANCED);
  });

  it("escalates large document jobs", () => {
    const result = selectModel({
      actionCode: "DOCUMENT_PAGE_PROCESS",
      isPremium: false,
      hasImage: false,
      documentPages: 40,
    });
    expect(result.model).toBe(ADVANCED);
  });

  it("keeps flashcards cheap", () => {
    const result = selectModel({
      actionCode: "FLASHCARD_GENERATE",
      isPremium: true,
      hasImage: false,
    });
    expect(result.model).toBe(STANDARD);
  });
});
