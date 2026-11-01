import { describe, expect, it } from "vitest";
import {
  applyResponse,
  foldResponses,
  masteryLabel,
  masteryValue,
  mergeRatings,
  PRIOR,
  scanRating,
} from "@/lib/level-check/mastery";
import { pickQuickScan, pickUnitCheck, poolIdFromSetupId, type PickItem } from "@/lib/level-check/select";

describe("mastery (Beta-Binomial)", () => {
  it("öncel α=β=1, ustalık 0.5, veri yok", () => {
    expect(masteryValue(PRIOR)).toBe(0.5);
    expect(masteryLabel(PRIOR)).toMatchObject({ kind: "no_data", text: "Henüz yeterli veri yok" });
  });
  it("zorluk ağırlıkları 0.7 / 1.0 / 1.3", () => {
    expect(applyResponse(PRIOR, true, "easy")).toEqual({ alpha: 1.7, beta: 1, n: 1 });
    expect(applyResponse(PRIOR, true, "medium")).toEqual({ alpha: 2, beta: 1, n: 1 });
    expect(applyResponse(PRIOR, false, "hard")).toEqual({ alpha: 1, beta: 2.3, n: 1 });
  });
  it("n<3 tahmini, n≥3 güvenli etiket", () => {
    const two = foldResponses([{ correct: true, difficulty: "medium" }, { correct: false, difficulty: "easy" }]);
    expect(masteryLabel(two).kind).toBe("estimate");
    expect(masteryLabel(two).text).toBe("tahmini");
    const three = foldResponses([...Array(3)].map(() => ({ correct: true, difficulty: "hard" as const })));
    expect(masteryLabel(three)).toMatchObject({ kind: "confident", text: "3 yanıta dayalı" });
    expect(masteryValue(three)).toBeCloseTo(4.9 / 5.9);
  });
  it("tarama eşikleri ve açık işaretin önceliği", () => {
    expect(scanRating(PRIOR)).toBeNull();
    expect(scanRating(foldResponses([{ correct: false, difficulty: "medium" }, { correct: false, difficulty: "easy" }]))).toBe("zayif");
    expect(scanRating(foldResponses([{ correct: true, difficulty: "medium" }, { correct: true, difficulty: "hard" }]))).toBe("iyi");
    expect(scanRating(foldResponses([{ correct: true, difficulty: "medium" }, { correct: false, difficulty: "medium" }]))).toBe("orta");
    expect(mergeRatings({ a: "iyi" }, { a: "zayif", b: "zayif" })).toEqual({ a: "iyi", b: "zayif" });
  });
});

function items(unit: string, n: number): PickItem[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${unit}-${i}`,
    unitId: unit,
    outcomeId: `${unit}-o${i % 3}`,
    difficulty: (["easy", "medium", "hard"] as const)[i % 3]!,
  }));
}

describe("soru seçimi", () => {
  it("hızlı tarama ağır ünitelerden en çok 12 soru, öğesiz ünite atlanır", () => {
    const pool = [...items("u1", 9), ...items("u2", 9), ...items("u3", 9)];
    const picked = pickQuickScan(
      [
        { unitId: "u1", weight: 2, order: 0 },
        { unitId: "u2", weight: 13, order: 1 },
        { unitId: "u3", weight: 5, order: 2 },
        { unitId: "bos", weight: 99, order: 3 },
      ],
      pool,
    );
    expect(picked).toHaveLength(12);
    expect(picked[0]!.unitId).toBe("u2");
    expect(picked.some((p) => p.unitId === "bos")).toBe(false);
    expect(new Set(picked.map((p) => p.id)).size).toBe(12);
  });
  it("havuz boşsa boş", () => {
    expect(pickQuickScan([{ unitId: "u1", weight: 1, order: 0 }], [])).toEqual([]);
  });
  it("ünite kontrolü 3–4 soru, 3'ten azsa yok", () => {
    expect(pickUnitCheck(items("u", 9)).length).toBe(4);
    expect(pickUnitCheck(items("u", 3)).length).toBe(3);
    expect(pickUnitCheck(items("u", 2))).toEqual([]);
  });
  it("kurulum kimliği (0 tabanlı) → havuz kimliği (1 tabanlı)", () => {
    expect(poolIdFromSetupId("yks-2026-tarih#0")).toBe("yks-2026-tarih#1");
    expect(poolIdFromSetupId("bozuk")).toBeNull();
  });
});
