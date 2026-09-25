import { describe, expect, it, vi } from "vitest";
import {
  isTransientProviderError,
  transientRetryFits,
  withTransientRetry,
} from "@/lib/ai/transient-retry";

describe("transient provider errors", () => {
  it("retries 429, 5xx, and connection timeouts only", () => {
    expect(isTransientProviderError(Object.assign(new Error("up"), { status: 503 }))).toBe(true);
    expect(isTransientProviderError(Object.assign(new Error("up"), { status: 502 }))).toBe(true);
    expect(isTransientProviderError(Object.assign(new Error("up"), { status: 429 }))).toBe(true);
    expect(isTransientProviderError(Object.assign(new Error("slow"), { name: "APIConnectionTimeoutError" }))).toBe(
      false,
    );
    class APIConnectionTimeoutError extends Error {}
    expect(isTransientProviderError(new APIConnectionTimeoutError("slow"))).toBe(true);
    class APIConnectionError extends Error {}
    expect(isTransientProviderError(new APIConnectionError("reset"))).toBe(true);
    expect(isTransientProviderError(Object.assign(new Error("no"), { status: 400 }))).toBe(false);
    expect(isTransientProviderError(Object.assign(new Error("no"), { status: 401 }))).toBe(false);
    expect(isTransientProviderError(new Error("pedagogy"))).toBe(false);
    class APIUserAbortError extends Error {}
    expect(isTransientProviderError(Object.assign(new APIUserAbortError("stop"), { status: 500 }))).toBe(false);
  });

  it("skips the retry when the call would pass the function budget", () => {
    const startedAt = 1_000;
    expect(transientRetryFits(startedAt, 90_000, startedAt + 90_000)).toBe(true);
    expect(transientRetryFits(startedAt, 90_000, startedAt + 200_000)).toBe(false);
  });

  it("calls the model a second time after one transient failure", async () => {
    const sleep = vi.fn(async () => {});
    const run = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(Object.assign(new Error("up"), { status: 503 }))
      .mockResolvedValueOnce("lesson");
    await expect(withTransientRetry(run, { startedAt: Date.now(), callTimeoutMs: 90_000, sleep })).resolves.toBe(
      "lesson",
    );
    expect(run).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("does not retry a 400 or a second 503", async () => {
    const sleep = vi.fn(async () => {});
    const bad = vi.fn<() => Promise<string>>().mockRejectedValue(Object.assign(new Error("bad"), { status: 400 }));
    await expect(withTransientRetry(bad, { startedAt: Date.now(), callTimeoutMs: 90_000, sleep })).rejects.toThrow(
      "bad",
    );
    expect(bad).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();

    const down = vi.fn<() => Promise<string>>().mockRejectedValue(Object.assign(new Error("up"), { status: 503 }));
    await expect(withTransientRetry(down, { startedAt: Date.now(), callTimeoutMs: 90_000, sleep })).rejects.toThrow(
      "up",
    );
    expect(down).toHaveBeenCalledTimes(2);
  });
});
