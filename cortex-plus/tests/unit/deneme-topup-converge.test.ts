import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { assertDeliverable, selectDeliverable, semanticDuplicate, type DeliveryItem, type DeliverySlot } from "@/lib/learning/deliverable";
import { fillUntilDelivered } from "@/lib/learning/fill-until-delivered";
import { itemValidity, validityKind } from "@/lib/learning/item-validity";
import { allocateQuestions, slotFromTopicRow } from "@/lib/learning/mock-exam/allocate";
import { defaultSlots } from "@/lib/learning/mock-exam/blueprint";
import { pollGenerationJob } from "@/lib/learning/mock-exam/progress";
import { quizSystem, quizVerifySystem } from "@/lib/learning/teacher-quiz";

const LABELS = ["Alfa", "Beta", "Gama", "Delta", "Epsilon", "Zeta", "Kappa", "Teta", "Iota"] as const;

function paper(): { slots: DeliverySlot[]; counts: number[] } {
  const topics = LABELS.map((label, index) =>
    slotFromTopicRow({ id: `k${index + 1}`, label, passageChars: 400 }),
  );
  const allocation = allocateQuestions(topics, 20);
  const plans = defaultSlots(20, false);
  const queue = [...plans];
  const slots: DeliverySlot[] = [];
  for (const row of allocation) {
    const planned = queue.splice(0, row.count);
    for (const plan of planned) {
      slots.push({
        topicId: row.topicId,
        topicLabel: row.topicLabel,
        type: plan.type,
        points: plan.points,
        point: "eşik 24",
        signature: "p",
      });
    }
  }
  return { slots, counts: allocation.map((row) => row.count) };
}

function generator() {
  let attempt = 0;
  let serial = 3;
  const firstTopic: string[] = [];
  const nextN = () => {
    while (String(serial).includes("24")) serial += 1;
    const n = serial;
    serial += 1;
    return n;
  };
  return (request: { topicId: string | null; topicLabel: string; slots: DeliverySlot[] }): DeliveryItem[] =>
    request.slots.map(() => {
      attempt += 1;
      const n = nextN();
      const label = request.topicLabel;
      const invalid = attempt % 5 === 0;
      let text = label === LABELS[0] && firstTopic.length >= 2 ? firstTopic[0]! : `${label} için bu ifade doğru mudur ${n}?`;
      if (label === LABELS[0] && firstTopic.length < 2 && !invalid) firstTopic.push(text);
      if (invalid) text = `==${text}==`;
      const correct = `Doğru ${label} ${n}`;
      return {
        topicId: request.topicId,
        topicLabel: label,
        type: "mcq",
        text,
        options: [correct, `Yanılgı ${label} ${n} a`, `Yanılgı ${label} ${n} b`, `Yanılgı ${label} ${n} c`],
        correctAnswers: [correct],
        explanation: label,
        sourceLabel: "kaynak",
      };
    });
}

function publishedOk(slots: DeliverySlot[], items: DeliveryItem[]) {
  const gate = assertDeliverable(slots, items, (item) => item);
  expect(gate.canPublish).toBe(true);
  expect(gate.publishable).toHaveLength(20);
  expect(gate.note).toBeNull();
  for (const item of gate.publishable) {
    expect(item.text.includes("==")).toBe(false);
    expect(item.text.includes("24")).toBe(false);
    expect(itemValidity({ kind: validityKind(item.type), text: item.text, options: item.options, correct: item.correctAnswers }).ok).toBe(true);
  }
  for (let left = 0; left < gate.publishable.length; left += 1) {
    for (let right = left + 1; right < gate.publishable.length; right += 1) {
      expect(semanticDuplicate(gate.publishable[left]!, gate.publishable[right]!)).toBe(false);
    }
  }
}

describe("deneme converges to the promised count", () => {
  const { slots, counts } = paper();

  it("plans 20 questions across 9 topics with a typed tail", () => {
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(20);
    expect(new Set(counts).size).toBeGreaterThan(1);
    expect(20 % 9).not.toBe(0);
    expect(slots.filter((slot) => slot.type === "mcq")).toHaveLength(14);
    expect(slots.some((slot) => slot.type === "multi_mcq")).toBe(true);
    expect(slots.some((slot) => slot.type === "open")).toBe(true);
  });

  it("does not publish when a short wave is not allowed to continue", async () => {
    const make = generator();
    const result = await fillUntilDelivered({
      slots,
      maxWaves: 2,
      followUpWaves: 0,
      generate: async (request) => make(request),
      read: (item) => item,
    });
    expect(result.ok).toBe(false);
    expect(result.items.length).toBeLessThan(20);
    expect(assertDeliverable(slots, result.items, (item) => item).canPublish).toBe(false);
  });

  it("fills exactly 20 in one call after rejects and uneven topics", async () => {
    const make = generator();
    let replaced = false;
    const result = await fillUntilDelivered({
      slots,
      maxWaves: 1,
      generate: async (request) => make(request),
      onWave: (report) => {
        if (report.replacement) replaced = true;
      },
      read: (item) => item,
    });
    expect(result.ok).toBe(true);
    expect(result.items).toHaveLength(20);
    expect(result.waves).toBeLessThanOrEqual(8);
    expect(replaced).toBe(true);
    publishedOk(result.slots, result.items);
    expect(selectDeliverable(slots, result.items, (item) => item).canPublish).toBe(false);
  });

  it("fills exactly 20 across one-wave chunks when the wave count is kept", async () => {
    const make = generator();
    let bag: DeliveryItem[] = [];
    let wave = 0;
    let modelIndexes: Record<string, number> = {};
    let stalled: string[] = [];
    let result: Awaited<ReturnType<typeof fillUntilDelivered<DeliveryItem>>> | null = null;
    for (let call = 0; call < 8 && !result?.ok; call += 1) {
      const prior = bag;
      result = await fillUntilDelivered({
        slots,
        prior,
        maxWaves: 1,
        followUpWaves: 0,
        initialWave: wave,
        modelIndexes,
        stalled,
        generate: async (request) => {
          const made = make(request);
          bag = [...bag, ...made];
          return made;
        },
        read: (item) => item,
      });
      wave = result.completedWave;
      modelIndexes = result.modelIndexes;
      stalled = result.stalled;
    }
    expect(result?.ok).toBe(true);
    expect(result?.items).toHaveLength(20);
    publishedOk(result!.slots, result!.items);
  });

  it("does not converge when each chunk forgets the wave count", async () => {
    const make = generator();
    let bag: DeliveryItem[] = [];
    let modelIndexes: Record<string, number> = {};
    let stalled: string[] = [];
    let result: Awaited<ReturnType<typeof fillUntilDelivered<DeliveryItem>>> | null = null;
    for (let call = 0; call < 8; call += 1) {
      const prior = bag;
      result = await fillUntilDelivered({
        slots,
        prior,
        maxWaves: 1,
        followUpWaves: 0,
        initialWave: 0,
        modelIndexes,
        stalled,
        generate: async (request) => {
          const made = make(request);
          bag = [...bag, ...made];
          return made;
        },
        read: (item) => item,
      });
      modelIndexes = result.modelIndexes;
      stalled = result.stalled;
      if (result.ok) break;
    }
    expect(result?.ok).toBe(false);
    expect(assertDeliverable(slots, result?.items ?? [], (item) => item).canPublish).toBe(false);
  });

  it("lets a written exam rephrase a point and still rejects a false or broken item", () => {
    const writer = quizSystem("document", "practice", false, undefined, true);
    const checker = quizVerifySystem("document", undefined, true);
    expect(writer).toContain("Cümleyi aynen kopyalamak zorunda değilsin");
    expect(writer).not.toContain("yalnızca KAYNAK metnindeki bilgiye dayanır");
    expect(checker).toContain("aynı noktayı başka sayı, bağlam ya da açıyla sormak C değildir");
    expect(quizSystem("document")).toContain("KAYNAK KURALI (kesin)");
    expect(quizVerifySystem("document")).toContain("Kaynakta dayanağı olmayan");
  });
});

describe("job poll keeps a running exam", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not fail while the job is still running", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls += 1;
        const body = calls < 90 ? { state: "running", progress: { ready: 1, promised: 20 } } : { state: "done", examId: "exam-1" };
        return { ok: true, json: async () => body };
      }),
    );
    const waited = await pollGenerationJob("job-1", () => undefined, { waitMs: 0, maxMs: 60_000 });
    expect(waited).toEqual({ examId: "exam-1" });
    expect(calls).toBeGreaterThan(80);
  });

  it("returns failed only when the job failed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ state: "failed" }) })),
    );
    const waited = await pollGenerationJob("job-1", () => undefined, { waitMs: 0, maxMs: 60_000 });
    expect(waited).toEqual({ failed: true });
  });

  it("returns without a failure when the wait ends and the job is still running", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, json: async () => ({ state: "running" }) })),
    );
    const waited = await pollGenerationJob("job-1", () => undefined, { waitMs: 0, maxMs: 0 });
    expect(waited.failed).toBeUndefined();
    expect(waited.examId).toBeUndefined();
  });
});

describe("deneme wiring", () => {
  const read = (file: string) => readFileSync(file, "utf8");

  it("logs each wave and keeps the wave on both paths", () => {
    const create = read("src/lib/learning/mock-exam/create.ts");
    expect(create).toContain("logMockExamWave");
    expect(create).not.toContain("Kaynakta olmayan olgu yazma.");
    const durable = read("src/lib/learning/mock-exam-durable.ts");
    expect(durable).toContain("examId: jobId");
    expect(durable).toContain("wave: stash.wave");
    const fallback = read("src/lib/learning/mock-exam/fallback-exam.ts");
    expect(fallback).toContain("examId: ctx.record.id");
    expect(read("src/lib/learning/mock-exam/progress.ts")).not.toContain("attempt < 80");
    expect(read("src/components/parity/mock-exam-setup.tsx")).toContain("if (waited.failed) setRetryJobId");
  });
});
