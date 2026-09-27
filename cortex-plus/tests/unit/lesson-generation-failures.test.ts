import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { recordLessonGenerationFailure } from "@/lib/learning/lesson-generation-failures";

describe("lesson_generation_failures kaydı", () => {
  it("15) üç hata türünde satır yazar; hata üretimi bozmaz", async () => {
    const inserted: Record<string, unknown>[] = [];
    const service = {
      from: () => ({
        insert: async (row: Record<string, unknown>) => {
          inserted.push(row);
          return { data: null, error: null };
        },
      }),
    } as never;

    for (const reason of [
      "source_unavailable",
      "content_verification_failed",
      "generation_failed",
    ]) {
      await recordLessonGenerationFailure(service, {
        userId: "u1",
        prepId: "p1",
        topicId: "t1",
        topicLabel: "Stokiyometri",
        kind: "lesson",
        stage: reason === "source_unavailable" ? "source" : "verification",
        reason,
        reasons: ["test"],
        sourceTrace: { steps: [{ step: "source_refs", ok: false }] },
      });
    }

    expect(inserted).toHaveLength(3);
    expect(inserted.map((row) => row.reason)).toEqual([
      "source_unavailable",
      "content_verification_failed",
      "generation_failed",
    ]);
    // PII / taslak yok
    expect(JSON.stringify(inserted)).not.toMatch(/overview|body|prompt/i);
  });

  it("insert patlasa bile fırlatmaz", async () => {
    const service = {
      from: () => ({
        insert: async () => {
          throw new Error("db down");
        },
      }),
    } as never;
    await expect(
      recordLessonGenerationFailure(service, {
        userId: "u",
        stage: "source",
        reason: "search_error",
      }),
    ).resolves.toBeUndefined();
  });
});
