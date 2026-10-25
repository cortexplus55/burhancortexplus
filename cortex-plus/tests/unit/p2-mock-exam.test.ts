import { describe, expect, it } from "vitest";
import { dropNearDuplicates } from "@/lib/learning/item-dedup";
import { allocateQuestions, slotFromTopicRow } from "@/lib/learning/mock-exam/allocate";
import { topUpTargets } from "@/lib/learning/mock-exam/create";
import { mockElapsedLabel } from "@/lib/learning/mock-exam/time-limit";

describe("yazılı deneme kotası ve süre", () => {
  it("kurulum ve üretim aynı ağırlıktan aynı kotayı kurar", () => {
    const rows = [
      { id: "a", label: "Konu 6", sourceRefs: [{ weightPercent: 30, examHeavy: true }] },
      { id: "b", label: "Konu 7", sourceRefs: [{ weightPercent: 10, examHeavy: false }] },
    ];
    const slots = rows.map((row) => slotFromTopicRow(row));
    const announced = allocateQuestions(slots, 5);
    const produced = allocateQuestions(slots.map((slot) => ({ ...slot })), 5);
    expect(produced.map((row) => [row.topicLabel, row.count])).toEqual(
      announced.map((row) => [row.topicLabel, row.count]),
    );
    expect(announced.find((row) => row.topicLabel === "Konu 6")!.count).toBeGreaterThan(
      announced.find((row) => row.topicLabel === "Konu 7")!.count,
    );
  });

  it("eksik kendi konusunda kapanır; dolu konu büyümez", () => {
    const allocation = [
      { topicLabel: "Konu 6", count: 3 },
      { topicLabel: "Konu 7", count: 2 },
    ];
    const have = new Map([["Konu 6", 1], ["Konu 7", 2]]);
    expect(topUpTargets(allocation, have, 2)).toEqual([{ row: allocation[0], missing: 2 }]);
  });

  it("aynı denemede yakın soru ikinci kez durmaz", () => {
    const questions = [
      { text: "Mutlak butlan hangi durumda ortaya çıkar?" },
      { text: "İptal ile butlan arasındaki fark nedir?" },
      { text: "Mutlak butlan hangi durumlarda ortaya çıkar?" },
    ];
    const kept = dropNearDuplicates(questions, (question) => question.text);
    expect(kept).toHaveLength(2);
    expect(kept.map((question) => question.text)).not.toContain(questions[2]!.text);
  });

  it("harcanan süre sınır değil, başlangıç ile bitiş arasıdır", () => {
    expect(mockElapsedLabel("2026-10-25T10:00:00Z", "2026-10-25T10:18:00Z")).toBe("18 dk");
    expect(mockElapsedLabel("2026-10-25T10:00:00Z", "2026-10-25T10:00:20Z")).toBe("20 sn");
    expect(mockElapsedLabel(null, "2026-10-25T10:18:00Z")).toBe("—");
    expect(mockElapsedLabel("2026-10-25T10:00:00Z", null)).toBe("—");
  });
});
