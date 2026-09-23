import { describe, expect, it } from "vitest";

/**
 * Streak güncelleme kurallarının saf hali — record-activity.ts ile aynı mantık.
 * DB'siz test için burada kopyalandı; davranış bozulursa iki yer de güncellenir.
 */
function nextStreak(
  existing: { current: number; last: string | null } | null,
  today: string,
  yesterday: string,
): number {
  if (!existing) return 1;
  if (existing.last === today) return existing.current || 1;
  if (existing.last === yesterday) return (existing.current || 0) + 1;
  return 1;
}

describe("streak activity math", () => {
  it("ilk aktivite 1", () => {
    expect(nextStreak(null, "2026-09-23", "2026-09-22")).toBe(1);
  });

  it("aynı gün tekrar artmaz", () => {
    expect(
      nextStreak({ current: 4, last: "2026-09-23" }, "2026-09-23", "2026-09-22"),
    ).toBe(4);
  });

  it("dün aktivite vardıysa +1", () => {
    expect(
      nextStreak({ current: 4, last: "2026-09-22" }, "2026-09-23", "2026-09-22"),
    ).toBe(5);
  });

  it("ara gün kaçırılırsa 1'e düşer", () => {
    expect(
      nextStreak({ current: 9, last: "2026-09-20" }, "2026-09-23", "2026-09-22"),
    ).toBe(1);
  });
});
