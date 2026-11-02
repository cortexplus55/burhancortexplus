import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { readSupplementSections, supplementScreens, supplementSourceKey } from "@/lib/content-pool/supplement";

describe("Senin belgenden ek", () => {
  it("aynı belge kümesi aynı anahtar (yeniden ücret yok)", () => {
    expect(supplementSourceKey(["b", "a"])).toBe(supplementSourceKey(["a", "b"]));
    expect(supplementSourceKey(["a"])).not.toBe(supplementSourceKey(["a", "c"]));
  });
  it("kısa/bozuk bölümleri atar, en çok 4", () => {
    const long = "x".repeat(60);
    const out = readSupplementSections({ sections: [{ heading: "A", text: "kısa" }, ...Array(6).fill({ heading: "B", text: long, pages: [3, -1] })] });
    expect(out).toHaveLength(4);
    expect(out[0].pages).toEqual([3]);
  });
  it("kredi yetmezse dürüst not, hazır ders sürer", () => {
    const s = supplementScreens({ state: "insufficient_credits", cost: 15 }, 2);
    expect(JSON.stringify(s)).toContain("15 kredi");
    expect(supplementScreens({ state: "none" }, 5)).toEqual([]);
    expect(supplementScreens({ state: "insufficient_credits", cost: 15 }, 0)).toEqual([]);
  });
});
