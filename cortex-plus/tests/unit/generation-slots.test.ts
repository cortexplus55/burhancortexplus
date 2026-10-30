import { readFileSync } from "node:fs";
import { readSource } from "./helpers/node-sources";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

/*
  Üretim yuvaları (19 Ekim 2026, satışa hazırlık Faz 3.2): aynı anda en çok N içerik üretimi.
  Yuva dolunca öğrenci isteği yer bekler, yine doluysa `generation_busy` (hata değil, sıra);
  önceden yazım yuvaların %70'ini kullanır ve beklemez. Redis'e ulaşılamazsa kapı kapanmaz.
*/

const ENV_KEYS = ["GENERATION_SLOTS", "KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"];
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  for (const key of ENV_KEYS) delete process.env[key];
  vi.resetModules();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  vi.unstubAllGlobals();
});

/** Upstash REST pipeline'ın yuvalar için yeten kadarı (sorted set). */
function fakeRedis() {
  const zset = new Map<string, number>();
  const run = (cmd: string[]) => {
    const [op, , a, b] = cmd;
    if (op === "ZREMRANGEBYSCORE") {
      const max = Number(b);
      let n = 0;
      for (const [member, score] of zset) if (score <= max) (zset.delete(member), (n += 1));
      return n;
    }
    if (op === "ZADD") return zset.set(b!, Number(a)) && 1;
    if (op === "ZCARD") return zset.size;
    if (op === "ZREM") return zset.delete(a!) ? 1 : 0;
    if (op === "PEXPIRE") return 1;
    return null;
  };
  const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    const commands = JSON.parse(String(init.body)) as string[][];
    return new Response(JSON.stringify(commands.map((cmd) => ({ result: run(cmd) }))), { status: 200 });
  });
  return { zset, fetchMock };
}

describe("bellek yedeği (yerel, test)", () => {
  it("sınıra kadar verir; doluyken öğrenci bekler, yer açılınca alır; önceden yazım %70 ile sınırlı", async () => {
    process.env.GENERATION_SLOTS = "2";
    const { acquireGenerationSlot, generationSlotsInUse } = await import("@/lib/ai/generation-slots");
    const a = await acquireGenerationSlot("student");
    const b = await acquireGenerationSlot("student");
    expect(a.ok && b.ok).toBe(true);
    expect((await generationSlotsInUse()).active).toBe(2);

    const full = await acquireGenerationSlot("student", { waitMs: 20, pollMs: 5 });
    expect(full.ok).toBe(false);

    // Önceden yazım: 2 × 0,7 → 1 yuva; biri doluyken başlamaz.
    if (a.ok) await a.release();
    expect((await acquireGenerationSlot("prefetch")).ok).toBe(false);

    const waiting = acquireGenerationSlot("student", { waitMs: 500, pollMs: 5 });
    setTimeout(() => void (b.ok && b.release()), 20);
    expect((await waiting).ok).toBe(true);
  });
});

describe("Redis (paylaşımlı)", () => {
  beforeEach(() => {
    process.env.KV_REST_API_URL = "https://redis.test";
    process.env.KV_REST_API_TOKEN = "t";
  });

  it("kira kaydı tutar; sınır aşılınca kendi kaydını geri alır; bırakınca siler", async () => {
    process.env.GENERATION_SLOTS = "1";
    const redis = fakeRedis();
    vi.stubGlobal("fetch", redis.fetchMock);
    const { acquireGenerationSlot } = await import("@/lib/ai/generation-slots");
    const a = await acquireGenerationSlot("student");
    expect(a.ok).toBe(true);
    expect(redis.zset.size).toBe(1);
    const b = await acquireGenerationSlot("student", { waitMs: 0 });
    expect(b.ok).toBe(false);
    expect(redis.zset.size).toBe(1);
    if (a.ok) await a.release();
    expect(redis.zset.size).toBe(0);
  });

  it("süresi geçmiş kira sayılmaz (çöken işlev yuvayı tutmaz)", async () => {
    process.env.GENERATION_SLOTS = "1";
    const redis = fakeRedis();
    redis.zset.set("eski", Date.now() - 1);
    vi.stubGlobal("fetch", redis.fetchMock);
    const { acquireGenerationSlot } = await import("@/lib/ai/generation-slots");
    expect((await acquireGenerationSlot("student", { waitMs: 0 })).ok).toBe(true);
  });

  it("Redis'e ulaşılamazsa kapı kapanmaz", async () => {
    process.env.GENERATION_SLOTS = "1";
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("down");
    }));
    const { acquireGenerationSlot } = await import("@/lib/ai/generation-slots");
    expect((await acquireGenerationSlot("student", { waitMs: 0 })).ok).toBe(true);
    expect((await acquireGenerationSlot("student", { waitMs: 0 })).ok).toBe(true);
  });
});

describe("withGenerationSlot", () => {
  it("yuva yoksa iş hiç çalışmaz, `busy` döner", async () => {
    process.env.GENERATION_SLOTS = "1";
    const { acquireGenerationSlot, withGenerationSlot } = await import("@/lib/ai/generation-slots");
    const held = await acquireGenerationSlot("student");
    const work = vi.fn(async () => "iş");
    const out = await withGenerationSlot("prefetch", work, () => "meşgul");
    expect(out).toBe("meşgul");
    expect(work).not.toHaveBeenCalled();
    if (held.ok) await held.release();
    expect(await withGenerationSlot("prefetch", work, () => "meşgul")).toBe("iş");
  });
});

describe("ekran tarafı: sıradasın", () => {
  it("postJsonWithRetry meşgul cevabında bekleyip yeniden sorar; sonra cevap döner", async () => {
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(503, { code: "generation_busy" }))
      .mockResolvedValueOnce(json(503, { code: "generation_busy" }))
      .mockResolvedValueOnce(json(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const { postJsonWithRetry } = await import("@/lib/learning/generation-retry");
    const onBusy = vi.fn();
    const out = await postJsonWithRetry("/api/x", () => ({}), { busyDelayMs: 1, onBusy });
    expect(out.res.status).toBe(200);
    expect(onBusy).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("dört motor yuvayla çalışır; düğüm ekranı ve podcast sayfası 'sıradasın' notunu gösterir", () => {
    for (const file of [
      "src/lib/learning/teacher-lesson-run.ts",
      "src/lib/learning/teacher-quiz-run.ts",
      "src/lib/learning/teacher-podcast-run.ts",
      "src/lib/learning/teacher-engine-run.ts",
    ]) {
      const source = readSource(file);
      expect(source, file).toContain("withGenerationSlot(");
      expect(source, file).toContain('error: "generation_busy"');
    }
    const session = readSource("src/components/parity/exam-node-session.tsx");
    expect(session).toContain("code === BUSY_CODE");
    expect(session).toContain("note={queueNote ? BUSY_NOTE : undefined}");
    const podcast = readSource("src/components/parity/prep-podcast-session.tsx");
    expect(podcast).toContain("note={queued ? BUSY_NOTE : undefined}");
  });
});
