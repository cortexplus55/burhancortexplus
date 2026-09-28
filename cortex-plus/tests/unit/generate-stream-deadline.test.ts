import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * The OpenAI SDK timeout stops at response headers, so a stream that keeps
 * the connection open could run past the function ceiling. A real local SSE
 * server that sends one chunk and then goes quiet proves the call is cut.
 */
const credits = vi.hoisted(() => ({ refunded: [] as string[], committed: [] as string[] }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return { ...actual, env: { ...actual.env, OPENAI_API_KEY: "test-key" } };
});
vi.mock("@/lib/credits/service", () => ({
  reserveCredits: async () => ({ ok: true, reservationId: "r1", cost: 2 }),
  commitCredits: async (_s: unknown, id: string) => void credits.committed.push(id),
  refundCredits: async (_s: unknown, id: string) => void credits.refunded.push(id),
  recordUsage: async () => {},
  newIdempotencyKey: (p: string) => `${p}-k`,
}));
vi.mock("@/lib/learning/validation-metrics", () => ({
  recordValidationEvent: async () => {},
  metricsFromFailure: () => ({}),
}));

let server: http.Server;
const previousBaseUrl = process.env.OPENAI_BASE_URL;

beforeAll(async () => {
  server = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/event-stream" });
    const chunk = {
      id: "x",
      object: "chat.completion.chunk",
      created: 0,
      model: "m",
      choices: [{ index: 0, delta: { content: '{"units":[' } }],
    };
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    // …and then nothing, forever.
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});

afterAll(() => {
  server.closeAllConnections();
  server.close();
  process.env.OPENAI_BASE_URL = previousBaseUrl;
});

async function run(opts: { deadlineInMs: number; stallMs: number }) {
  const { generateJson } = await import("@/lib/ai/generate");
  const started = Date.now();
  const outcome = await generateJson({
    service: {} as never,
    userId: "u1",
    actionCode: "STUDY_PLAN_GENERATE",
    isPremium: true,
    verificationMode: "schema",
    schemaHint: "{}",
    userPrompt: "outline",
    stream: true,
    streamStallMs: opts.stallMs,
    callTimeoutMs: 240_000,
    deadlineAt: started + opts.deadlineInMs,
    maxTransientAttempts: 3,
    parse: (raw) => raw,
  });
  return { outcome, ms: Date.now() - started };
}

describe("streamed generation respects the round deadline", () => {
  it("aborts a streaming call at the deadline and refunds", async () => {
    const { outcome, ms } = await run({ deadlineInMs: 1_200, stallMs: 60_000 });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toBe("deadline");
    expect(ms).toBeLessThan(4_000);
    expect(credits.refunded).toContain("r1");
    expect(credits.committed).toEqual([]);
  });

  it("aborts a stalled stream long before the deadline and does not retry it", async () => {
    const { outcome, ms } = await run({ deadlineInMs: 60_000, stallMs: 600 });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toBe("stalled");
    expect(ms).toBeLessThan(4_000);
  });
});
