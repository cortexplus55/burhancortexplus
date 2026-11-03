import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rateLimit, redisPipeline, REDIS_TIMEOUT_MS } from "@/lib/rate-limit";

describe("Redis fail-open", () => {
  beforeEach(() => {
    process.env.UPSTASH_REDIS_REST_URL = "https://redis.invalid";
    process.env.UPSTASH_REDIS_REST_TOKEN = "t";
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it("falls back to the memory limiter when Redis throws", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));
    const key = `fo:${Math.random()}`;
    expect((await rateLimit(key, 1, 60)).allowed).toBe(true);
    expect((await rateLimit(key, 1, 60)).allowed).toBe(false); // yedek sınır hâlâ korur
    expect(await redisPipeline([["GET", "x"]])).toBeNull();
  });

  it("falls back on quota errors (non-2xx)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("quota", { status: 429 }));
    expect((await rateLimit(`fo:${Math.random()}`, 5, 60)).allowed).toBe(true);
  });

  it("does not block when Redis hangs", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_u, init) =>
        new Promise((_r, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("t", "TimeoutError")));
        }),
    );
    const t0 = Date.now();
    expect((await rateLimit(`fo:${Math.random()}`, 5, 60)).allowed).toBe(true);
    expect(Date.now() - t0).toBeLessThan(REDIS_TIMEOUT_MS + 400);
  });
});
