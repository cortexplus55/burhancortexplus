import { describe, expect, it } from "vitest";
import { parabolaAt, quadrantOf, scoreCellPlacement, trigAt } from "@/lib/lab/simulations";

describe("simülasyon matematiği", () => {
  it("90° sin 1, cos ~0, 2. bölge", () => {
    const t = trigAt(90);
    expect(t.sin).toBeCloseTo(1, 5);
    expect(t.cos).toBeCloseTo(0, 5);
    expect(quadrantOf(120)).toBe(2);
  });

  it("parabol tepe ve diskriminant", () => {
    const p = parabolaAt(1, -2, -3);
    expect(p.disc).toBe(16);
    expect(p.rootState).toBe("iki");
    expect(p.vertex).toEqual({ x: 1, y: -4 });
  });

  it("hücre yerleşimini sayar", () => {
    expect(scoreCellPlacement({ center: "nucleus", right: "ribo" })).toMatchObject({
      correct: 1,
      total: 5,
    });
    expect(scoreCellPlacement({ center: "nucleus", right: "mito", left: "ribo", top: "golgi", bottom: "er" }).correct).toBe(5);
  });
});
