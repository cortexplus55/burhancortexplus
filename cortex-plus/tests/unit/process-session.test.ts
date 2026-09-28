import { describe, expect, it } from "vitest";
import {
  PROCESS_RETRY_MESSAGE,
  PROCESS_STALL_MS,
  isTransientProcessStatus,
  pickProcessPhase,
  processProgressFingerprint,
  requestDocumentProcessing,
  stallCursorKey,
  transientBackoffMs,
} from "@/lib/documents/process-session";

describe("document processing phases", () => {
  it("extracts before any chunk exists and maps only while the topic map is pending", () => {
    expect(
      pickProcessPhase({
        status: "pending",
        chunkCount: 0,
        topicMapStatus: "none",
        learningV2: true,
      }),
    ).toBe("extract");
    expect(pickProcessPhase({
      status: "completed", chunkCount: 0, topicMapStatus: "ready", learningV2: true,
    })).toBe("extract");
    expect(
      pickProcessPhase({
        status: "processing",
        chunkCount: 12,
        topicMapStatus: "pending",
        learningV2: true,
      }),
    ).toBe("map");
    expect(
      pickProcessPhase({
        status: "completed",
        chunkCount: 12,
        topicMapStatus: "ready",
        learningV2: true,
      }),
    ).toBe("done");
    expect(
      pickProcessPhase({
        status: "processing",
        chunkCount: 4,
        topicMapStatus: "none",
        learningV2: false,
      }),
    ).toBe("done");
  });

  it("failed belgede parça yoksa extract, parça varsa harita bekliyorsa map", () => {
    expect(
      pickProcessPhase({
        status: "failed",
        chunkCount: 0,
        topicMapStatus: "none",
        learningV2: true,
      }),
    ).toBe("extract");
    expect(
      pickProcessPhase({
        status: "failed",
        chunkCount: 8,
        topicMapStatus: "pending",
        learningV2: true,
      }),
    ).toBe("map");
    expect(
      pickProcessPhase({
        status: "failed",
        chunkCount: 8,
        topicMapStatus: "ready",
        learningV2: true,
      }),
    ).toBe("extract");
  });

  it("retries one transient 5xx, then keeps polling a 202 until the document is ready", async () => {
    const statuses = [504, 202, 200];
    const seen: number[] = [];
    const result = await requestDocumentProcessing({
      documentId: "doc-1",
      sleep: async () => {},
      post: async () => {
        const status = statuses[seen.length] ?? 200;
        seen.push(status);
        return {
          status,
          body: status === 200 ? { status: "completed", pageCount: 12 } : { error: "timeout" },
        };
      },
    });
    expect(seen).toEqual([504, 202, 200]);
    expect(result.ok).toBe(true);
    expect(result.retried).toBe(true);
    expect(result.body.pageCount).toBe(12);
    expect(PROCESS_RETRY_MESSAGE.length).toBeGreaterThan(10);
    expect(isTransientProcessStatus(504)).toBe(true);
    expect(isTransientProcessStatus(503)).toBe(true);
    expect(isTransientProcessStatus(0)).toBe(true);
    expect(isTransientProcessStatus(402)).toBe(false);
  });

  it("honours retryAfterMs and grows with attempt", () => {
    expect(transientBackoffMs(0, 2000)).toBeGreaterThanOrEqual(2000);
    expect(transientBackoffMs(2, 2000)).toBeGreaterThan(transientBackoffMs(0, 2000) - 400);
  });

  it("same nextPage'te 3 retryable 503 sonrası terminal döner", async () => {
    let calls = 0;
    const result = await requestDocumentProcessing({
      documentId: "doc-503",
      sleep: async () => {},
      post: async () => {
        calls += 1;
        return {
          status: 503,
          body: {
            retryable: true,
            retryAfterMs: 100,
            nextPage: 55,
            phase: "extract",
            error: "Sunucu yoğun.",
          },
        };
      },
    });
    expect(calls).toBe(3);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(503);
    expect(result.body.retryable).toBe(false);
  });

  it("503 nextPage:null uses last-known page from prior 202 for identical cursor", async () => {
    expect(stallCursorKey({ phase: "extract", nextPage: null }, 55)).toBe(
      "extract:55",
    );

    let calls = 0;
    const result = await requestDocumentProcessing({
      documentId: "doc-503-null",
      sleep: async () => {},
      post: async () => {
        calls += 1;
        if (calls === 1) {
          return {
            status: 202,
            body: { phase: "extract", nextPage: 55, status: "processing" },
          };
        }
        return {
          status: 503,
          body: {
            retryable: true,
            retryAfterMs: 50,
            nextPage: null,
            phase: "extract",
            error: "Sunucu yoğun.",
          },
        };
      },
    });
    // Three identical 503s after the 202 → terminal (4 posts total).
    expect(calls).toBe(4);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(503);
    expect(result.body.retryable).toBe(false);
  });

  it("tracks extract progress fingerprints", () => {
    expect(
      processProgressFingerprint({ phase: "extract", nextPage: 7 }),
    ).toBe("extract:7");
  });

  it("stops when progress stalls for the stall window", async () => {
    let now = 0;
    const result = await requestDocumentProcessing({
      documentId: "stall-doc",
      stallMs: 1000,
      now: () => now,
      sleep: async (ms) => {
        now += ms;
      },
      post: async () => ({
        status: 202,
        body: { phase: "extract", nextPage: 1, pageCount: 99 },
      }),
    });
    expect(result.ok).toBe(false);
    expect(result.body.code).toBe("processing_timeout");
    expect(now).toBeGreaterThanOrEqual(1000);
    expect(PROCESS_STALL_MS).toBeGreaterThan(300_000);
  });

  it("does not retry a photo-quota or credit refusal", async () => {
    let calls = 0;
    const result = await requestDocumentProcessing({
      documentId: "doc-2",
      sleep: async () => {},
      post: async () => {
        calls += 1;
        return { status: 402, body: { code: "photo_quota_exhausted" } };
      },
    });
    expect(calls).toBe(1);
    expect(result.ok).toBe(false);
    expect(result.retried).toBe(false);
    expect(result.status).toBe(402);
  });

  it("continues past the former eight-round limit for a 99-page PDF", async () => {
    let calls = 0;
    const result = await requestDocumentProcessing({
      documentId: "doc-99",
      sleep: async () => {},
      post: async () => {
        calls += 1;
        return calls <= 17
          ? { status: 202, body: { status: "processing", nextPage: calls * 6 + 1 } }
          : { status: 200, body: { status: "completed", pageCount: 99 } };
      },
    });
    expect(result.ok).toBe(true);
    expect(result.rounds).toBe(18);
    expect(result.body.pageCount).toBe(99);
  });
});
