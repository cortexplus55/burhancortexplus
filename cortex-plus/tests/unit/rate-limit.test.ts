import { describe, expect, it, beforeEach } from "vitest";
import { clientKey, rateLimit } from "@/lib/rate-limit";

describe("rate limiting", () => {
  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it("allows requests under the limit and blocks the overflow", async () => {
    const key = `test:${Math.random()}`;
    expect((await rateLimit(key, 2, 60)).allowed).toBe(true);
    expect((await rateLimit(key, 2, 60)).allowed).toBe(true);
    expect((await rateLimit(key, 2, 60)).allowed).toBe(false);
  });

  it("derives a key from the forwarded client address", () => {
    const request = new Request("https://cortexplus.app/api/ai/chat", {
      headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
    });
    expect(clientKey(request, "chat")).toBe("cortex:chat:203.0.113.9");
  });
});
