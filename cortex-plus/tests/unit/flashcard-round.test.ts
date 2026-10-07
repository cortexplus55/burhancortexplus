import { describe, expect, it } from "vitest";
import { knownCardCount, missedCards, repeatedCardsLine } from "@/lib/learning/flashcard-round";
import { formatDayLong } from "@/lib/format";

describe("kart tekrar turu", () => {
  it("ilk turda Hayır denenleri sırayla verir", () => {
    expect(missedCards({ "0": true, "1": false, "2": "false", "3": true }, 4)).toEqual([1, 2]);
    expect(missedCards({}, 3)).toEqual([]);
  });

  it("tekrarda bilinen yalnızca ilk turda bilinmeyense sayılır", () => {
    const answers = { "0": true, "1": false, "2": false };
    expect(knownCardCount(answers, 3, [])).toBe(1);
    expect(knownCardCount(answers, 3, [1])).toBe(2);
    // Zaten bilinen ya da destede olmayan sıra iki kez sayılmaz.
    expect(knownCardCount(answers, 3, [0, 1, 1, 9])).toBe(2);
  });

  it("tekrar satırı", () => {
    expect(repeatedCardsLine(0)).toBeNull();
    expect(repeatedCardsLine(1)).toContain("1 kart");
    expect(repeatedCardsLine(3)).toContain("3 kart");
  });
});

describe("gün tarihi", () => {
  it("ISO gün Türkçe uzun tarihe döner, gün kaymaz", () => {
    expect(formatDayLong("2026-10-12")).toBe("12 Ekim 2026");
    expect(formatDayLong("2026-01-01")).toBe("1 Ocak 2026");
    expect(formatDayLong(null)).toBeNull();
    expect(formatDayLong("yarın")).toBe("yarın");
  });
});
