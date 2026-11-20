/**
 * "İki şık arasında kaldım" soru başına bir kez (20 Kasım 2026, Faz 5 denetimi). Farklı şık çiftleriyle tekrar sorup
 * bütün çeldiriciler toplanamaz: ilk cevap saklanır, aynı soruda sonraki her istek aynı cevabı alır.
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/rate-limit", () => ({ redisPipeline: vi.fn(async () => null) }));

import { claimTwoOptionAnswer, clearTwoOptionMemory, readTwoOptionAnswer, twoOptionKey } from "@/lib/learning/two-option-once";

describe("iki şık: soru başına tek cevap", () => {
  beforeEach(() => clearTwoOptionMemory());

  it("ilk cevap saklanır; aynı soruda farklı çift yeni şık eletemez", async () => {
    const key = twoOptionKey("u1", "a1", 3);
    expect(await readTwoOptionAnswer(key)).toBeNull();
    const first = await claimTwoOptionAnswer(key, { hint: "Fark: tanım.", fallback: false, eliminated: "D şıkkı" });
    expect(first.eliminated).toBe("D şıkkı");
    const second = await claimTwoOptionAnswer(key, { hint: "Başka ipucu", fallback: false, eliminated: "E şıkkı" });
    expect(second).toEqual(first);
    expect(await readTwoOptionAnswer(key)).toEqual(first);
  });

  it("başka soru ve başka öğrenci ayrı sayılır", async () => {
    await claimTwoOptionAnswer(twoOptionKey("u1", "a1", 3), { hint: "x", fallback: false, eliminated: "A" });
    expect(await readTwoOptionAnswer(twoOptionKey("u1", "a1", 4))).toBeNull();
    expect(await readTwoOptionAnswer(twoOptionKey("u2", "a1", 3))).toBeNull();
  });

  it("uç önce saklı cevaba bakar ve yeni cevabı saklayarak döner; çip kullanıldıktan sonra kapalı", () => {
    const route = readFileSync("src/app/api/learning/two-option-hint/route.ts", "utf8").replace(/\r\n/g, "\n");
    expect(route.indexOf("readTwoOptionAnswer(onceKey)")).toBeLessThan(route.indexOf("writeTwoOptionHint("));
    expect(route).toContain("claimTwoOptionAnswer(onceKey");
    const chip = readFileSync("src/components/learning/two-option-hint.tsx", "utf8").replace(/\r\n/g, "\n");
    expect(chip).toContain("disabled={used}");
    expect(chip).toContain("{used ? TWO_OPTION_USED : TWO_OPTION_CHIP}");
  });
});
