import { describe, expect, it } from "vitest";
import { assertDeliverable, coversPoint, semanticDuplicate, type DeliveryItem, type DeliverySlot } from "@/lib/learning/deliverable";
import { fillUntilDelivered } from "@/lib/learning/fill-until-delivered";
import { measurableTokens } from "@/lib/learning/source-quantities";
import math from "../fixtures/subjects/math-7.json";
import history from "../fixtures/subjects/history-10.json";
import circuit from "../fixtures/subjects/circuit-uni.json";
import kpss from "../fixtures/subjects/kpss-citizenship.json";
import chemistry from "../fixtures/subjects/chemistry.json";
import english from "../fixtures/subjects/english-grammar.json";

type Fixture = {
  id: string;
  level: string;
  language: "tr" | "en";
  material: string;
  topics: { id: string; label: string; points: string[] }[];
};

const subjects = [math, history, circuit, kpss, chemistry, english] as Fixture[];

function slotsFor(fixture: Fixture, counts: number[], type = "mcq"): DeliverySlot[] {
  const slots: DeliverySlot[] = [];
  fixture.topics.forEach((topic, topicIndex) => {
    const count = counts[topicIndex] ?? 0;
    for (let index = 0; index < count; index += 1) {
      const point = topic.points[index] ?? null;
      slots.push({
        topicId: topic.id,
        topicLabel: topic.label,
        type,
        point,
        signature: point ? `p:${topic.id}:${index}` : null,
      });
    }
  });
  return slots;
}

function goodItem(fixture: Fixture, slot: DeliverySlot, n: number): DeliveryItem {
  const point = slot.point ?? "";
  const tokens = measurableTokens(point).join(" ");
  const en = fixture.language === "en";
  const label = slot.topicLabel;
  let text: string;
  if (slot.type === "true_false") {
    text = en
      ? `${label} is the statement and the form is correct ${n} ${tokens}`.trim()
      : `${label} için bu ifade doğrudur ve kaynakla uyumludur ${n} ${tokens}`.trim();
  } else if (slot.type === "card") {
    text = en
      ? `${label} is the front of the card and the back holds ${n} ${tokens}`.trim()
      : `${label} ön yüzü bu kavramı sorar ${n} ${tokens}`.trim();
  } else {
    text = en
      ? `${label} is the right form and the answer is choice ${n}? ${tokens}`.trim()
      : `${label} için bu ifade doğru mudur ${n}? ${tokens}`.trim();
  }
  const correct = en ? `Yes ${label} ${n}` : `Doğru ${label} ${n}`;
  const choice = slot.type === "mcq" || slot.type === "multi_mcq";
  return {
    topicId: slot.topicId,
    topicLabel: label,
    type: slot.type,
    text,
    options: choice
      ? [correct, en ? `No ${label} ${n} a` : `Yanılgı ${label} ${n} a`, en ? `No ${label} ${n} b` : `Yanılgı ${label} ${n} b`, en ? `No ${label} ${n} c` : `Yanılgı ${label} ${n} c`]
      : undefined,
    correctAnswers: [correct],
    explanation: point || label,
    sourceLabel: fixture.id,
    material: fixture.material,
  };
}

function junk(fixture: Fixture, slot: DeliverySlot): DeliveryItem[] {
  const en = fixture.language === "en";
  const base = goodItem(fixture, slot, 1);
  const wrong: DeliveryItem = {
    ...base,
    text: en ? "Bu sorunun doğru cevabı bir ve olan ifade değildir?" : "The subject and the verb is the wrong language here?",
  };
  const unseen: DeliveryItem = {
    ...base,
    text: en ? "Use the equation above to find the result now?" : "yukarıdaki denkleme göre sonuç kaçtır şimdi?",
    explanation: "",
    options: base.options,
  };
  const empty: DeliveryItem = { ...base, text: " " };
  const malformed: DeliveryItem = {
    ...base,
    options: ["Aynı şık", "Aynı şık", "Başka şık"],
    correctAnswers: ["Aynı şık"],
  };
  const off: DeliveryItem = { ...base, topicLabel: en ? "Unrelated heading" : "Alakasız başlık", text: en ? "Unrelated heading is the right form and the answer is choice 9?" : "Alakasız başlık için bu ifade doğru mudur 9?" };
  const clone = goodItem(fixture, slot, 7);
  return [empty, malformed, clone, { ...clone }, off, wrong, unseen];
}

async function deliver(fixture: Fixture, counts: number[], type: string, mode: "good" | "hostile" | "timeout" | "model-fail") {
  const slots = slotsFor(fixture, counts, type);
  const calls = new Map<string, number>();
  const result = await fillUntilDelivered({
    slots,
    maxWaves: 4,
    parallelism: 8,
    generate: async (request) => {
      const seen = (calls.get(request.topicLabel) ?? 0) + 1;
      calls.set(request.topicLabel, seen);
      if (mode === "timeout" && seen === 1) throw new Error("timeout");
      if (mode === "model-fail" && request.modelIndex === 0) return [];
      if (mode === "hostile" && seen === 1) {
        const first = request.slots[0];
        return first ? [...junk(fixture, first), goodItem(fixture, first, 3)] : [];
      }
      return request.slots.map((slot, index) => goodItem(fixture, slot, seen * 100 + index));
    },
    read: (item) => item,
  });
  return { slots, result };
}

function expectExact(fixture: Fixture, slots: DeliverySlot[], items: DeliveryItem[]) {
  expect(items).toHaveLength(slots.length);
  const texts = items.map((item) => item.text);
  expect(new Set(texts).size).toBe(texts.length);
  for (let left = 0; left < items.length; left += 1) {
    for (let right = left + 1; right < items.length; right += 1) {
      expect(semanticDuplicate(items[left]!, items[right]!)).toBe(false);
    }
  }
  for (const topic of fixture.topics) {
    const promised = slots.filter((slot) => slot.topicLabel === topic.label).length;
    const got = items.filter((item) => item.topicLabel === topic.label).length;
    expect(got, `${fixture.id}:${topic.label}`).toBe(promised);
  }
  const signed = slots.filter((slot) => slot.signature).map((slot) => slot.signature);
  expect(new Set(signed).size).toBe(signed.length);
}

describe("promised count is the delivered count", () => {
  it.each(subjects.map((subject) => [subject.id, subject.level, subject] as const))(
    "%s (%s) fills 20, 10 and a 5-question topic test",
    async (_id, _level, fixture) => {
      for (const counts of [[5, 5, 5, 5], [3, 3, 2, 2], [5, 0, 0, 0]] as const) {
        const { slots, result } = await deliver(fixture, [...counts], "mcq", counts[0] === 5 && counts[1] === 5 ? "hostile" : "good");
        expect(result.ok, fixture.id).toBe(true);
        expect(result.note).toBeNull();
        expect(result.items).toHaveLength(slots.length);
        expectExact(fixture, slots, result.items);
        expect(result.coverage).toHaveLength(slots.filter((slot) => slot.signature).length);
        expect(new Set(result.coverage).size).toBe(result.coverage.length);
        const gate = assertDeliverable(slots, result.items, (item) => item);
        expect(gate.canPublish).toBe(true);
        expect(gate.publishable).toHaveLength(slots.length);
        expect(gate.note).toBeNull();
      }
    },
  );

  it.each(subjects.map((subject) => [subject.id, subject] as const))(
    "%s true/false and cards also match the promised count",
    async (_id, fixture) => {
      for (const type of ["true_false", "card"]) {
        const { slots, result } = await deliver(fixture, [2, 2, 2, 2], type, "good");
        expect(result.ok, `${fixture.id}:${type}`).toBe(true);
        expect(result.items).toHaveLength(8);
        expect(result.note).toBeNull();
        expectExact(fixture, slots, result.items);
      }
    },
  );

  it.each(subjects.map((subject) => [subject.id, subject] as const))(
    "%s survives a timeout and a failed model",
    async (_id, fixture) => {
      for (const mode of ["timeout", "model-fail"] as const) {
        const { slots, result } = await deliver(fixture, [5, 5, 5, 5], "mcq", mode);
        expect(result.ok, `${fixture.id}:${mode}`).toBe(true);
        expect(result.items).toHaveLength(slots.length);
        expect(result.waves).toBeGreaterThanOrEqual(2);
        expect(result.note).toBeNull();
        if (mode === "model-fail") expect(result.modelIndex).toBeGreaterThanOrEqual(1);
        expectExact(fixture, slots, result.items);
      }
    },
  );

  it("publishes only when every slot is filled", async () => {
    const fixture = subjects[0]!;
    const slots = slotsFor(fixture, [5, 0, 0, 0]);
    let wave = 0;
    const result = await fillUntilDelivered({
      slots,
      maxWaves: 2,
      generate: async (request) => {
        wave += 1;
        const slot = request.slots[0];
        return slot ? [goodItem(fixture, slot, wave)] : [];
      },
      read: (item) => item,
    });
    expect(result.ok).toBe(true);
    expect(result.note).toBeNull();
    expect(result.items).toHaveLength(slots.length);
    const gate = assertDeliverable(result.slots, result.items, (item) => item);
    expect(gate.canPublish).toBe(true);
    expect(gate.publishable).toHaveLength(slots.length);
    const prefix = assertDeliverable(result.slots, result.items.slice(0, -1), (item) => item);
    expect(prefix.canPublish).toBe(false);
    expect(prefix.publishable).toEqual([]);
    expect(prefix.note).toBeNull();
  });

  it("does not reject a question for missing the source number", () => {
    const slot: DeliverySlot = { topicLabel: "Alan", type: "mcq", point: "alan 24 cm", signature: "area" };
    const missing = goodItem(math as Fixture, { ...slot, point: null, signature: null }, 4);
    expect(coversPoint(missing, slot)).toBe(false);
    expect(coversPoint({ ...missing, explanation: "alan 24 cm" }, slot)).toBe(true);
    expect(coversPoint(missing, { ...slot, signature: "" })).toBe(true);
    expect(coversPoint(missing, { ...slot, point: "yıl 1923", signature: "year" })).toBe(true);
    const gate = assertDeliverable([slot], [missing], (item) => item);
    expect(gate.canPublish).toBe(true);
    expect(gate.publishable).toHaveLength(1);
    expect(gate.note).toBeNull();
  });

  it("counts one item when two stems share a fact signature", () => {
    const slots: DeliverySlot[] = [
      { topicLabel: "Oran", type: "mcq", point: "değer %40", signature: "a" },
      { topicLabel: "Oran", type: "mcq", point: "payda oranı 40", signature: "b" },
    ];
    const left = goodItem(math as Fixture, slots[0]!, 1);
    left.text = "Oran için bu ifade doğru mudur 1? değer %40";
    const right = goodItem(math as Fixture, slots[1]!, 2);
    right.text = "Oran için bu ifade doğru mudur 2? değer %40";
    const gate = assertDeliverable(slots, [left, right], (item) => item);
    expect(gate.delivered.length).toBeLessThan(2);
    expect(gate.publishable).toEqual([]);
    expect(gate.note).toBeNull();
  });
});
