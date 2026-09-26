import { describe, expect, it } from "vitest";
import {
  PROCESS_RETRY_MESSAGE,
  isTransientProcessStatus,
  pickProcessPhase,
  requestDocumentProcessing,
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
    expect(isTransientProcessStatus(402)).toBe(false);
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
});
