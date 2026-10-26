import { describe, expect, it } from "vitest";
import { fillUntilDelivered, type FillClock } from "@/lib/learning/fill-until-delivered";
import type { DeliveryItem, DeliverySlot } from "@/lib/learning/deliverable";

const WAVE_MS = 22_000;

function clock(): FillClock & { elapsed: () => number } {
  let now = 0;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
    elapsed: () => now,
  };
}

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

describe("delivery speed", () => {
  it("a 20-question exam is one parallel wave under 90s", async () => {
    const time = clock();
    let inflight = 0;
    let maxInflight = 0;
    const result = await fillUntilDelivered({
      slots: slots(20, 5),
      parallelism: 8,
      waveMs: WAVE_MS,
      clock: time,
      generate: async (request) => {
        inflight += 1;
        maxInflight = Math.max(maxInflight, inflight);
        await Promise.resolve();
        inflight -= 1;
        return request.slots.map((slot, index) => item(slot, index + 1));
      },
      read: (row) => row,
    });
    expect(result.ok).toBe(true);
    expect(result.items).toHaveLength(20);
    expect(result.waves).toBe(1);
    expect(result.elapsedMs).toBe(WAVE_MS);
    expect(result.elapsedMs).toBeLessThanOrEqual(90_000);
    expect(maxInflight).toBeGreaterThan(1);
    const serial = 5 * WAVE_MS;
    expect(serial).toBeGreaterThan(90_000);
    expect(result.elapsedMs).toBeLessThan(serial);
  });

  it("a 5-question topic test is one wave under 30s", async () => {
    const time = clock();
    const result = await fillUntilDelivered({
      slots: slots(5, 1),
      parallelism: 8,
      waveMs: WAVE_MS,
      clock: time,
      generate: async (request) => request.slots.map((slot, index) => item(slot, index + 1)),
      read: (row) => row,
    });
    expect(result.ok).toBe(true);
    expect(result.items).toHaveLength(5);
    expect(result.waves).toBe(1);
    expect(result.elapsedMs).toBe(WAVE_MS);
    expect(result.elapsedMs).toBeLessThanOrEqual(30_000);
  });
});
