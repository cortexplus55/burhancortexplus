import { describe, expect, it } from "vitest";
import { savedReviewPayload } from "@/lib/learning/saved-review";

describe("kayıtlı içeriği yeniden açma", () => {
  it("yazımı süren dersi ve boş gövdeyi açmaz", () => {
    expect(savedReviewPayload({ type: "lesson", building: true, lesson: { format: 2 } }, "salt")).toBeNull();
    expect(savedReviewPayload({ type: "quiz", questions: [] }, "salt")).toBeNull();
    expect(savedReviewPayload(null, "salt")).toBeNull();
  });

  it("test, kart ve podcast gövdesini kredi bayrağı olmadan taşır", () => {
    const quiz = savedReviewPayload(
      { type: "quiz", questions: [{ stem: "Soru" }], building: false, prefetchVariant: "eski" },
      "salt",
    );
    expect(quiz).toMatchObject({ type: "quiz", reviewed: true });
    expect(quiz).not.toHaveProperty("prefetchVariant");
    expect(quiz).not.toHaveProperty("building");
    expect(savedReviewPayload({ type: "flashcards", cards: [{ front: "a", back: "b" }] }, "salt")?.reviewed).toBe(true);
    expect(savedReviewPayload({ type: "podcast", chapters: [{ title: "1" }] }, "salt")?.reviewed).toBe(true);
  });
});
