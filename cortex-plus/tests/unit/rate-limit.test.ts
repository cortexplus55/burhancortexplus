import { describe, expect, it, beforeEach } from "vitest";
import { clientKey, rateLimit, userKey } from "@/lib/rate-limit";

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
    expect(clientKey(request, "chat")).toBe("cortex:ip:chat:203.0.113.9");
  });

  it("prefers the address Vercel sets over a client-supplied one", () => {
    const request = new Request("https://cortexplus.app/api/ai/chat", {
      headers: {
        "x-forwarded-for": "1.2.3.4",
        "x-vercel-forwarded-for": "203.0.113.9",
      },
    });
    expect(clientKey(request, "chat")).toBe("cortex:ip:chat:203.0.113.9");
  });

  it("keeps per-user buckets separate from per-address buckets", () => {
    const request = new Request("https://cortexplus.app/api/ai/chat", {
      headers: { "x-forwarded-for": "203.0.113.9" },
    });
    expect(userKey("user-1", "chat")).toBe("cortex:user:chat:user-1");
    expect(userKey("user-1", "chat")).not.toBe(clientKey(request, "chat"));
  });

  it("does not let two users on one address share a quota", async () => {
    const scope = `chat-${Math.random()}`;
    expect((await rateLimit(userKey("user-a", scope), 1, 60)).allowed).toBe(
      true,
    );
    expect((await rateLimit(userKey("user-a", scope), 1, 60)).allowed).toBe(
      false,
    );
    // A second student behind the same school NAT is unaffected.
    expect((await rateLimit(userKey("user-b", scope), 1, 60)).allowed).toBe(
      true,
    );
  });
});
