import { describe, expect, it } from "vitest";
import { applyAnswerLocks, lockedKeys } from "@/lib/learning/answer-lock";
import { stripAnswerMeta } from "@/lib/learning/learning-tracking";

describe("test cevap kilidi", () => {
  it("kilitli sorunun saklı cevabı yeni kayıtta değişmez", () => {
    const saved = { "0": "A", "1": "B", __locked: ["0"] };
    const out = applyAnswerLocks(saved, { "0": "C", "1": "D" });
    expect(out["0"]).toBe("A");
    expect(out["1"]).toBe("D");
    expect(lockedKeys(out)).toEqual(["0"]);
  });
  it("kilitler birleşir, geri alınamaz", () => {
    const out = applyAnswerLocks({ "0": "A", __locked: ["0"] }, { "0": "A", "1": "B", __locked: ["1"] });
    expect(lockedKeys(out)).toEqual(["0", "1"]);
  });
  it("kilitsiz kümede anahtar eklenmez; puanlamada kilit anahtarı atılır", () => {
    expect(applyAnswerLocks({}, { "0": "A" })).toEqual({ "0": "A" });
    expect(stripAnswerMeta({ "0": "A", __locked: ["0"] })).toEqual({ "0": "A" });
  });
});
