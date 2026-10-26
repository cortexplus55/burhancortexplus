import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DeliveryItem, DeliverySlot } from "@/lib/learning/deliverable";
import { fillUntilDelivered, type FillClock } from "@/lib/learning/fill-until-delivered";
import { JOB_BUDGET_MS } from "@/lib/learning/generation-job";
import {
  emptyFallback,
  PUBLISHED_GRACE_MS,
  pumpFallbackChunk,
  type FallbackRecord,
  type FallbackStore,
} from "@/lib/learning/mock-exam/fallback-chunk";
import { postMockExamWithProgress } from "@/lib/learning/mock-exam/progress";
import { runTopicTestShards } from "@/lib/learning/quiz-shards";

const TOPIC_LABELS = ["Alfa", "Beta", "Gamma", "Delta", "Epsilon"];

function slots(count: number, topics: number): DeliverySlot[] {
  return Array.from({ length: count }, (_, index) => ({
    topicId: `t${index % topics}`,
    topicLabel: TOPIC_LABELS[index % topics] ?? `Baslik${index % topics}`,
    type: "mcq",
  }));
}

function item(slot: DeliverySlot, n: number): DeliveryItem {
  const correct = `Doğru ${slot.topicLabel} ${n}`;
  return {
    topicId: slot.topicId,
    topicLabel: slot.topicLabel,
    type: "mcq",
    text: `${slot.topicLabel} için bu ifade doğru mudur ${n}?`,
    options: [correct, `Yanılgı ${n} a`, `Yanılgı ${n} b`, `Yanılgı ${n} c`],
    correctAnswers: [correct],
    explanation: slot.topicLabel,
    sourceLabel: "kaynak",
    material: "Bir konu için bu ifade olan bir cümledir ve değil denmez.",
  };
}

function mustRecord<T>(value: FallbackRecord<T> | { ok: false; status: number; error: string }): FallbackRecord<T> {
  if ("status" in value) throw new Error(value.error);
  return value;
}

function union<T>(left: T[], right: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const entry of [...left, ...right]) {
    const key = JSON.stringify(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

function memoryStore<T>() {
  const rows = new Map<string, FallbackRecord<T>>();
  let seq = 0;
  const clone = (row: FallbackRecord<T>): FallbackRecord<T> => structuredClone(row);
  const store: FallbackStore<T> = {
    async findActive(prepKey, now) {
      for (const row of rows.values()) {
        if (row.prepKey !== prepKey) continue;
        if (row.building && !row.examId) return clone(row);
        if (row.examId && row.publishedAt && now - row.publishedAt < PUBLISHED_GRACE_MS) return clone(row);
      }
      return null;
    },
    async load(id) {
      const row = rows.get(id);
      return row ? clone(row) : null;
    },
    async create(row) {
      const saved = { ...clone(row), id: row.id || `exam-${++seq}` };
      rows.set(saved.id, saved);
      return clone(saved);
    },
    async save(id, patch) {
      const current = rows.get(id);
      if (!current) return;
      rows.set(id, {
        ...current,
        ...patch,
        items: patch.items ? union(current.items, patch.items) : current.items,
        topicsAttempted: patch.topicsAttempted
          ? [...new Set([...current.topicsAttempted, ...patch.topicsAttempted])]
          : current.topicsAttempted,
        modelIndexes: { ...current.modelIndexes, ...(patch.modelIndexes ?? {}) },
      });
    },
    async acquire(id, now, leaseMs, token) {
      const current = rows.get(id);
      if (!current) return false;
      if (current.leaseUntil > now && current.leaseToken) return false;
      rows.set(id, { ...current, leaseUntil: now + leaseMs, leaseToken: token });
      return true;
    },
  };
  return { rows, store };
}

describe("yazılı deneme: tablo yokken süre dolunca", () => {
  it("kayıt tutulmazsa her istek 0'dan başlar ve kâğıt hiç çıkmaz", async () => {
    const starts: number[] = [];
    let published = 0;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const controller = new AbortController();
      let ready = 0;
      let noted = false;
      const result = await fillUntilDelivered({
        slots: slots(20, 5),
        parallelism: 1,
        maxWaves: 4,
        signal: controller.signal,
        generate: async (request) => {
          if (!noted) {
            starts.push(ready);
            noted = true;
          }
          ready += 1;
          controller.abort();
          return request.slots.map((slot, index) => item(slot, index + 1));
        },
        read: (row) => row,
      });
      if (result.ok && result.items.length === 20) published += 1;
    }
    expect(starts).toEqual([0, 0, 0, 0]);
    expect(published).toBe(0);
  });

  it("parça düşünce aynı kâğıt birikir ve söz verilen sayıya varır", async () => {
    const { store } = memoryStore<DeliveryItem>();
    const prepKey = "user:prep:spec";
    const generated = new Map<string, number>();
    const seen: number[] = [];
    let charges = 0;
    let publishes = 0;
    let now = 1_000;
    const pump = () =>
      pumpFallbackChunk({
        now,
        prepKey,
        store,
        onProgress: (progress) => seen.push(progress.done),
        charge: async () => {
          charges += 1;
          return { ok: true, reservationId: "res-1" };
        },
        refund: () => undefined,
        create: (seed) => store.create({ ...seed, promised: 20, topicTotal: 5 }),
        publish: async (record) => {
          publishes += 1;
          return { ok: true, examId: record.id };
        },
        runWave: async (ctx) => {
          const next = TOPIC_LABELS.find((label) => !ctx.record.topicsAttempted.includes(label));
          if (!next) {
            return {
              items: ctx.record.items,
              topicsAttempted: ctx.record.topicsAttempted,
              done: ctx.record.items.length >= 20,
              promised: 20,
              topicTotal: 5,
            };
          }
          generated.set(next, (generated.get(next) ?? 0) + 1);
          const made = slots(20, 5)
            .filter((slot) => slot.topicLabel === next)
            .map((slot, index) => item(slot, index + 1));
          const items = [...ctx.record.items, ...made];
          const topicsAttempted = [...ctx.record.topicsAttempted, next];
          await ctx.checkpoint({ items, topicsAttempted });
          throw new Error("time_limit");
        },
      });

    let result = await pump();
    for (let step = 0; step < 8 && !(result.ok && result.done); step += 1) {
      now += 1_000;
      result = await pump();
    }
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.done).toBe(true);
    expect(result.examId).toBeTruthy();
    expect(charges).toBe(1);
    expect(publishes).toBe(1);
    expect(TOPIC_LABELS.map((label) => generated.get(label))).toEqual([1, 1, 1, 1, 1]);
    for (let index = 1; index < seen.length; index += 1) expect(seen[index]).toBeGreaterThanOrEqual(seen[index - 1] ?? 0);
    const again = await pumpFallbackChunk({
      now: now + 1_000,
      prepKey,
      store,
      charge: async () => {
        charges += 1;
        return { ok: true, reservationId: "res-2" };
      },
      refund: () => undefined,
      create: (seed) => store.create(seed),
      publish: async () => {
        publishes += 1;
        return { ok: true, examId: "second" };
      },
      runWave: async () => {
        throw new Error("should_not_run");
      },
    });
    expect(again.ok && again.examId).toBe(result.examId);
    expect(charges).toBe(1);
    expect(publishes).toBe(1);
  });

  it("canlı kira ikinci üretimi açmaz", async () => {
    const { rows, store } = memoryStore<DeliveryItem>();
    const seeded = emptyFallback<DeliveryItem>("user:prep:spec", 1_000);
    seeded.reservationId = "res-1";
    seeded.leaseUntil = 50_000;
    seeded.leaseToken = "held";
    const created = mustRecord(await store.create(seeded));
    let ran = false;
    const result = await pumpFallbackChunk({
      now: 2_000,
      prepKey: seeded.prepKey,
      resumeId: created.id,
      store,
      charge: async () => ({ ok: true, reservationId: "res-2" }),
      refund: () => undefined,
      create: (seed) => store.create(seed),
      publish: async (record) => ({ ok: true, examId: record.id }),
      runWave: async () => {
        ran = true;
        return { items: [], topicsAttempted: [], done: false };
      },
    });
    expect(ran).toBe(false);
    expect(result.ok && result.running).toBe(true);
    expect(rows.get(created.id)?.leaseToken).toBe("held");
  });

  it("bütçe bir kez iade eder; sessiz istek üretmez, açık yeniden deneme soruları tutar", async () => {
    const { rows, store } = memoryStore<DeliveryItem>();
    const now = 1_000_000;
    const seeded = emptyFallback<DeliveryItem>("user:prep:spec", now - JOB_BUDGET_MS);
    seeded.reservationId = "res-1";
    seeded.startedAt = now - JOB_BUDGET_MS;
    seeded.promised = 20;
    seeded.topicTotal = 5;
    seeded.forced = true;
    seeded.items = [item(slots(1, 1)[0]!, 1)];
    seeded.topicsAttempted = ["Alfa"];
    const created = mustRecord(await store.create(seeded));
    let refunds = 0;
    let waves = 0;
    let charges = 0;
    const shared = {
      prepKey: seeded.prepKey,
      resumeId: created.id,
      store,
      charge: async () => {
        charges += 1;
        return { ok: true as const, reservationId: `res-${charges}` };
      },
      refund: () => {
        refunds += 1;
      },
      create: (seed: FallbackRecord<DeliveryItem>) => store.create(seed),
      publish: async (record: FallbackRecord<DeliveryItem>) => ({ ok: true, examId: record.id }),
      runWave: async (ctx: { record: FallbackRecord<DeliveryItem> }) => {
        waves += 1;
        return { items: ctx.record.items, topicsAttempted: ctx.record.topicsAttempted, done: false, promised: 20, topicTotal: 5 };
      },
    };
    const expired = await pumpFallbackChunk({ ...shared, now });
    expect(expired.ok).toBe(false);
    if (expired.ok) return;
    expect(expired.error).toBe("budget_exceeded");
    expect(refunds).toBe(1);
    expect(waves).toBe(0);
    expect(rows.get(created.id)?.items).toHaveLength(1);

    const silent = await pumpFallbackChunk({ ...shared, now: now + 1 });
    expect(silent.ok).toBe(false);
    expect(waves).toBe(0);
    expect(charges).toBe(0);

    const retried = await pumpFallbackChunk({ ...shared, now: now + 2, explicitRetry: true });
    expect(retried.ok).toBe(true);
    expect(charges).toBe(1);
    expect(waves).toBe(1);
    expect(rows.get(created.id)?.items).toHaveLength(1);
    expect(rows.get(created.id)?.topicsAttempted).toEqual(["Alfa"]);
  });

  it("ücret reddi aynı kâğıdı kilitmez", async () => {
    const { rows, store } = memoryStore<DeliveryItem>();
    const prepKey = "user:prep:spec";
    let charges = 0;
    let waves = 0;
    const denied = await pumpFallbackChunk({
      now: 5_000,
      prepKey,
      store,
      charge: async () => {
        charges += 1;
        return { ok: false, status: 402, error: "insufficient_credits" };
      },
      refund: () => undefined,
      create: (seed) => store.create({ ...seed, promised: 4, topicTotal: 1 }),
      publish: async (record) => ({ ok: true, examId: record.id }),
      runWave: async () => {
        waves += 1;
        return { items: [], topicsAttempted: [], done: true, promised: 4, topicTotal: 1 };
      },
    });
    expect(denied.ok).toBe(false);
    if (denied.ok) return;
    expect(denied.status).toBe(402);
    expect(denied.error).toBe("insufficient_credits");
    expect(waves).toBe(0);
    expect(rows.get(denied.resumeId ?? "")?.failed).toBe(false);

    const paid = await pumpFallbackChunk({
      now: 6_000,
      prepKey,
      store,
      charge: async () => {
        charges += 1;
        return { ok: true, reservationId: "res-1" };
      },
      refund: () => undefined,
      create: (seed) => store.create(seed),
      publish: async (record) => ({ ok: true, examId: record.id }),
      runWave: async (ctx) => {
        waves += 1;
        return { items: ctx.record.items, topicsAttempted: ctx.record.topicsAttempted, done: true, promised: 4, topicTotal: 1 };
      },
    });
    expect(paid.ok && paid.done).toBe(true);
    expect(waves).toBe(1);
    expect(charges).toBe(2);
  });
});

describe("kurulum sayacı geri gitmez", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("akış düşünce aynı kâğıdı sürer ve 0 yazmaz", async () => {
    const stream = (lines: unknown[]) =>
      new Response(`${lines.map((line) => JSON.stringify(line)).join("\n")}\n`, {
        status: 200,
        headers: { "Content-Type": "application/x-ndjson" },
      });
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        call += 1;
        const body = JSON.parse(String(init?.body ?? "{}")) as { resumeId?: string };
        if (call === 1) {
          return stream([{ type: "progress", done: 5, total: 5, label: null, resumeId: "11111111-1111-4111-8111-111111111111" }]);
        }
        expect(body.resumeId).toBe("11111111-1111-4111-8111-111111111111");
        return stream([
          { type: "progress", done: 0, total: 5, label: null, resumeId: body.resumeId },
          { type: "progress", done: 5, total: 5, label: null, resumeId: body.resumeId },
          { type: "done", status: 200, data: { examId: "e1", resumeId: body.resumeId } },
        ]);
      }),
    );
    const seen: number[] = [];
    const out = await postMockExamWithProgress("/api/x", () => ({ prepId: "p" }), (progress) => seen.push(progress.done), {
      delayMs: 1,
    });
    expect(seen[0]).toBe(5);
    expect(seen).not.toContain(0);
    expect(out.status).toBe(200);
    expect(out.data.examId).toBe("e1");
    expect(call).toBe(2);
  });
});

describe("konu testi duvar saati", () => {
  it("beş parça 30 saniyelik bütçeye sığar", async () => {
    let now = 0;
    const clock: FillClock = {
      now: () => now,
      advance: (ms) => {
        now += ms;
      },
    };
    const result = await runTopicTestShards({
      count: 5,
      parallelism: 5,
      clock,
      waveMs: 22_000,
      runShard: async (count) => {
        await Promise.resolve();
        return Array.from({ length: count }, (_, index) => index);
      },
    });
    expect(result.elapsedMs).toBe(22_000);
    expect(result.elapsedMs).toBeLessThanOrEqual(30_000);
    expect(result.maxInflight).toBeGreaterThan(1);
    expect(result.questions).toHaveLength(5);
    expect(5 * 22_000).toBeGreaterThan(30_000);
  });
});

describe("kablolama: deneme ve konu testi", () => {
  const read = (file: string) => readFileSync(file, "utf8");

  it("tablo yokken parça, kira ve süpürme duruyor", () => {
    const route = read("src/app/api/learning/exam-prep/mock-exam/route.ts");
    expect(route).toContain("runFallbackMockExam");
    expect(route).toContain('includes("application/x-ndjson")');
    expect(route).not.toContain("createMockExam(");
    const fallback = read("src/lib/learning/mock-exam/fallback-exam.ts");
    expect(fallback).toContain("maxWaves: 1");
    expect(fallback).toContain("prior");
    expect(read("src/lib/learning/generation-jobs.ts")).toContain("CHUNK_LEASE_MS");
    expect(read("src/app/api/cron/subscription-renewal/route.ts")).toContain("sweepAbandonedMockBuilds");
    const quiz = read("src/lib/learning/teacher-quiz-run.ts");
    expect(quiz).toContain("runTopicTestShards");
    expect(quiz).toContain('input.urgent && input.scope === "topic_test"');
  });
});
