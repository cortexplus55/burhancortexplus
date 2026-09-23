import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LessonV2 } from "@/lib/learning/teaching-standards";

const mocks = vi.hoisted(() => ({
  create: vi.fn(), review: vi.fn(), refund: vi.fn(), commit: vi.fn(),
}));
vi.mock("openai", () => ({ default: class { chat = { completions: { create: mocks.create } }; } }));
vi.mock("@/lib/env", () => ({ env: { OPENAI_API_KEY: "test" } }));
vi.mock("@/lib/ai/model-router", () => ({ selectModel: () => ({ model: "test", actionCode: "STUDY_PLAN_GENERATE" }) }));
vi.mock("@/lib/credits/service", () => ({
  reserveCredits: async () => ({ ok: true, reservationId: "r", cost: 1 }),
  newIdempotencyKey: () => "test", refundCredits: mocks.refund, commitCredits: mocks.commit, recordUsage: vi.fn(),
}));
vi.mock("@/lib/learning/validation-metrics", async (original) => ({
  ...await original<typeof import("@/lib/learning/validation-metrics")>(), recordValidationEvent: vi.fn(),
}));
vi.mock("@/lib/ai/quality-gate", async (original) => ({
  ...await original<typeof import("@/lib/ai/quality-gate")>(), verifyEducationalContent: mocks.review,
}));
import { EducationalVerificationError } from "@/lib/ai/quality-gate";
import { generatePodcastFromLesson } from "@/lib/learning/podcast-from-lesson";

describe("podcast semantic review", () => {
  it("refunds after semantic rejection even when the same quantities pass deterministic checks", async () => {
    const source = "No.200 eleğinden geçen %8 olduğu için zemin kaba danelidir; eşik %50'dir.";
    const lesson = {
      title: "Zemin Sınıflandırması", objective: "Eşiği kullanarak zemini sınıflandır.", overview: source,
      sections: [{ heading: "Dane Boyu", body: source }],
      example: { prompt: "Geçen oran %8 ise?", solution: source },
      commonMistake: { claim: "İnce danelidir.", correction: source },
      summary: [source],
    } as LessonV2;
    const draft = { title: lesson.title, chapters: ["Dane Boyu", "Eleğin İşlevi", "Sınıf Kararı", "Oranın Anlamı"].map((title) => ({
      title, lines: [{ speaker: "ada", text: "No.200 eleğinden geçen %8 ise ince danelidir." }, { speaker: "kerem", text: "Eşik %50 olarak kullanılır." }],
    })) };
    mocks.create.mockResolvedValue({ choices: [{ message: { content: JSON.stringify(draft) } }] });
    mocks.review.mockRejectedValue(new EducationalVerificationError("rejected", "domain", ["inverted_conclusion"]));
    const result = await generatePodcastFromLesson({ service: {} as SupabaseClient, userId: "u", isPremium: true,
      prepTitle: "Hazırlık", topicLabel: lesson.title, lesson });
    expect(result.ok).toBe(false);
    expect(mocks.create).toHaveBeenCalledTimes(2);
    expect(mocks.review).toHaveBeenCalledTimes(2);
    expect(mocks.commit).not.toHaveBeenCalled();
    expect(mocks.refund).toHaveBeenCalledWith({}, "r");
    const independent = mocks.review.mock.calls[0][0].independent(JSON.stringify(draft));
    expect(independent.requireSourceSupport).toBe(true);
    expect(independent.sourceExcerpt).toContain(source);
  });
});
