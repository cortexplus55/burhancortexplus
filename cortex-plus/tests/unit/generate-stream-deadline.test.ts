import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The OpenAI SDK timeout stops at response headers, so a stream that keeps
 * the connection open could run past the function ceiling. A real local SSE
 * server that sends one chunk and then goes quiet proves the call is cut.
 *
 * Zamanlama iki katmanda denetlenir (5 Kasım 2026; tam paket yükünde kararsızdı):
 *  1) `callGuard` sahte zamanlayıcıyla: hangi sayacın önce ateşlediği makine yüküne bağlı değildir.
 *  2) Gerçek SSE sunucusuyla uçtan uca yalnız SONUÇ denetlenir (neden, iade, kaç istek gitti);
 *     duvar saati eşiği yok. Sayaçlar birbirinden en az 50 kat uzak (1,2 sn / 60 sn / 240 sn):
 *     yük altında bile sıraları değişmez. "Yeniden denenmedi" istek sayısıyla kanıtlanır.
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

describe("callGuard: hangi sayaç önce ateşler (sahte zamanlayıcı, yükten bağımsız)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("tur son tarihi çağrı zaman aşımından önceyse tam o anda 'deadline' ile keser", async () => {
    const { callGuard } = await import("@/lib/ai/generate");
    const guard = callGuard({ callTimeoutMs: 240_000, deadlineAt: Date.now() + 1_200, stallMs: 60_000 });
    guard.touch();
    vi.advanceTimersByTime(1_199);
    expect(guard.reason()).toBeNull();
    expect(guard.signal.aborted).toBe(false);
    vi.advanceTimersByTime(1);
    expect(guard.reason()).toBe("deadline");
    expect(guard.signal.aborted).toBe(true);
    guard.dispose();
  });

  it("ilk jeton gelene kadar yalnız son tarih sayar; her parça durma sayacını sıfırlar", async () => {
    const { callGuard } = await import("@/lib/ai/generate");
    const guard = callGuard({ callTimeoutMs: 240_000, deadlineAt: Date.now() + 60_000, stallMs: 600 });
    vi.advanceTimersByTime(5_000); // büyük istemde ilk jeton geç gelir: durma sayacı henüz çalışmaz
    expect(guard.reason()).toBeNull();
    guard.touch();
    vi.advanceTimersByTime(599);
    guard.touch(); // ikinci parça sayacı yeniden kurar
    vi.advanceTimersByTime(599);
    expect(guard.reason()).toBeNull();
    vi.advanceTimersByTime(1);
    expect(guard.reason()).toBe("stalled");
    guard.dispose();
  });

  it("ilk ateşleyen kazanır; sonra gelen sayaç nedeni değiştirmez", async () => {
    const { callGuard } = await import("@/lib/ai/generate");
    const guard = callGuard({ callTimeoutMs: 240_000, deadlineAt: Date.now() + 1_000, stallMs: 600 });
    guard.touch();
    vi.advanceTimersByTime(600);
    expect(guard.reason()).toBe("stalled");
    vi.advanceTimersByTime(1_000);
    expect(guard.reason()).toBe("stalled");
    guard.dispose();
  });

  it("son tarih yoksa çağrı zaman aşımı 'deadline' sayılır; dispose bütün sayaçları durdurur", async () => {
    const { callGuard } = await import("@/lib/ai/generate");
    const byTimeout = callGuard({ callTimeoutMs: 2_000 });
    vi.advanceTimersByTime(2_000);
    expect(byTimeout.reason()).toBe("deadline");
    byTimeout.dispose();

    const disposed = callGuard({ callTimeoutMs: 1_000, stallMs: 100 });
    disposed.touch();
    disposed.dispose();
    vi.advanceTimersByTime(600_000);
    expect(disposed.reason()).toBeNull();
    expect(disposed.signal.aborted).toBe(false);
  });
});

/* ───────────── Uçtan uca: gerçek SSE sunucusu ───────────── */

let server: http.Server;
const mode = { slowFirstToken: false, hits: 0 };
const previousBaseUrl = process.env.OPENAI_BASE_URL;
type GenerateJson = typeof import("@/lib/ai/generate").generateJson;
let generateJson: GenerateJson;

beforeAll(async () => {
  server = http.createServer((_req, res) => {
    mode.hits += 1;
    const chunk = (content: string) =>
      `data: ${JSON.stringify({ id: "x", object: "chat.completion.chunk", created: 0, model: "m", choices: [{ index: 0, delta: { content } }] })}\n\n`;
    if (mode.slowFirstToken) {
      // Büyük istem: bir süre hiçbir şey, sonra cevabın tamamı TEK yazımda (ilk parça ile bitiş
      // aynı pakette gider; durma sayacı ikisinin arasında ateşleyemez).
      setTimeout(() => {
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.end(`${chunk('{"ok":true}')}data: [DONE]\n\n`);
      }, 1_500);
      return;
    }
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(chunk('{"units":['));
    // …and then nothing, forever.
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  process.env.OPENAI_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  // Modül yükü (vite dönüşümü) testin sayacına girmesin diye burada, geniş kanca süresiyle.
  ({ generateJson } = await import("@/lib/ai/generate"));
}, 60_000);

afterAll(() => {
  server.closeAllConnections();
  server.close();
  process.env.OPENAI_BASE_URL = previousBaseUrl;
});

beforeEach(() => {
  credits.refunded.length = 0;
  credits.committed.length = 0;
  mode.hits = 0;
});

async function run(opts: { deadlineInMs: number; stallMs: number }) {
  return generateJson({
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
    deadlineAt: Date.now() + opts.deadlineInMs,
    maxTransientAttempts: 3,
    parse: (raw) => raw,
  });
}

const E2E_TIMEOUT_MS = 30_000;

describe("streamed generation respects the round deadline", () => {
  it(
    "aborts a streaming call at the deadline, refunds, and does not retry",
    async () => {
      // Son tarih 1,2 sn; durma 60 sn; çağrı 240 sn. Test 30 sn'de bitiyorsa kesen sayaç son tarihtir.
      const outcome = await run({ deadlineInMs: 1_200, stallMs: 60_000 });
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.error).toBe("deadline");
      expect(credits.refunded).toEqual(["r1"]);
      expect(credits.committed).toEqual([]);
      expect(mode.hits).toBe(1);
    },
    E2E_TIMEOUT_MS,
  );

  it(
    "waits for a slow first token (deadline only), then stalls are watched",
    async () => {
      mode.slowFirstToken = true;
      try {
        // İlk jeton 1,5 sn sonra, durma sayacı 600 ms: sayaç ilk jetondan önce çalışsaydı cevap gelmezdi.
        const outcome = await run({ deadlineInMs: 60_000, stallMs: 600 });
        expect(outcome).toMatchObject({ ok: true, data: { ok: true } });
        expect(credits.committed).toEqual(["r1"]);
        expect(mode.hits).toBe(1);
      } finally {
        mode.slowFirstToken = false;
      }
    },
    E2E_TIMEOUT_MS,
  );

  it(
    "aborts a stalled stream long before the deadline and does not retry it",
    async () => {
      // Durma 600 ms; son tarih 60 sn. Yeniden deneme olsaydı sunucu ikinci isteği görürdü.
      const outcome = await run({ deadlineInMs: 60_000, stallMs: 600 });
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.error).toBe("stalled");
      expect(credits.refunded).toEqual(["r1"]);
      expect(mode.hits).toBe(1);
    },
    E2E_TIMEOUT_MS,
  );
});
