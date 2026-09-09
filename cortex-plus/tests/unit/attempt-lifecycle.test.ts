import { describe, expect, it } from "vitest";
import {
  creditIdempotencyKeyForStart,
  cursorIndexFromMeta,
  isCreatingStale,
  isStaleWrite,
  mergeAnswersForScoring,
  shouldReuseExistingStart,
  toPublicAttemptState,
} from "@/lib/learning/attempt-lifecycle";
import { scoreQuizAnswers, type QuizQuestion } from "@/lib/learning/exam-quiz";

describe("attempt lifecycle helpers", () => {
  it("maps active → ready for public state", () => {
    expect(toPublicAttemptState("creating")).toBe("creating");
    expect(toPublicAttemptState("active")).toBe("ready");
    expect(toPublicAttemptState("failed")).toBe("failed");
    expect(toPublicAttemptState("completed")).toBe("completed");
  });

  it("builds a stable credit idempotency key per start request", () => {
    expect(
      creditIdempotencyKeyForStart({
        userId: "u1",
        nodeId: "n1",
        clientRequestId: "req-1",
      }),
    ).toBe("exam_node_start_u1_n1_req-1");
  });

  it("merges saved answers so the last question survives refresh", () => {
    const merged = mergeAnswersForScoring(
      { "0": "A", "1": "B", "4": "D" },
      { "4": "C", __meta: { hintsUsed: { "4": true } } },
    );
    expect(merged["0"]).toBe("A");
    expect(merged["4"]).toBe("C");
    expect(merged.__meta).toEqual({ hintsUsed: { "4": true } });
  });

  it("includes the last saved answer in quiz scoring after reconnect", () => {
    const questions: QuizQuestion[] = [
      {
        text: "q1",
        options: ["A", "B"],
        correct: ["A"],
        multi: false,
      },
      {
        text: "q2",
        options: ["A", "B"],
        correct: ["B"],
        multi: false,
      },
    ];
    // Client reconnects with empty local state; saved answers still score.
    const merged = mergeAnswersForScoring({ "0": "A", "1": "B" }, {});
    expect(scoreQuizAnswers(questions, merged)).toEqual({ score: 2, total: 2 });
  });

  it("rejects stale generation or version writes", () => {
    expect(
      isStaleWrite({
        attemptGenerationId: "g-new",
        requestGenerationId: "g-old",
        attemptVersion: 3,
        expectedVersion: 3,
      }),
    ).toBe(true);
    expect(
      isStaleWrite({
        attemptGenerationId: "g1",
        requestGenerationId: "g1",
        attemptVersion: 4,
        expectedVersion: 3,
      }),
    ).toBe(true);
    expect(
      isStaleWrite({
        attemptGenerationId: "g1",
        requestGenerationId: "g1",
        attemptVersion: 3,
        expectedVersion: 3,
      }),
    ).toBe(false);
  });

  it("reuses ready attempts and retries stale creating", () => {
    expect(
      shouldReuseExistingStart({ status: "active", hasPayload: true }),
    ).toBe("return_ready");
    expect(
      shouldReuseExistingStart({ status: "creating", hasPayload: false }),
    ).toBe("resume_creating");
    expect(
      shouldReuseExistingStart({ status: "failed", hasPayload: false }),
    ).toBe("reject_failed");
    expect(isCreatingStale(new Date(Date.now() - 3 * 60 * 1000).toISOString())).toBe(
      true,
    );
    expect(isCreatingStale(new Date().toISOString())).toBe(false);
  });

  it("restores cursor from answer meta or answered keys", () => {
    expect(cursorIndexFromMeta({ cursorIndex: 3 }, {})).toBe(3);
    expect(cursorIndexFromMeta({}, { "0": true, "2": false })).toBe(2);
  });
});
