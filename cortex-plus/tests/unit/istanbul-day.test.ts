import { describe, expect, it } from "vitest";
import { addDays, istanbulDay, isoWeekday } from "@/lib/istanbul-day";

/**
 * Türkiye takvim günü. Sunucu UTC'de; Türkiye'de gün UTC 21:00'de değişiyor.
 */
describe("istanbulDay", () => {
  it("turns the day at 21:00 UTC, not at midnight UTC", () => {
    expect(istanbulDay(new Date("2026-09-30T20:59:59Z"))).toBe("2026-09-30");
    expect(istanbulDay(new Date("2026-09-30T21:00:00Z"))).toBe("2026-10-01");
    expect(istanbulDay(new Date("2026-09-30T22:30:00Z"))).toBe("2026-10-01");
  });
});

describe("addDays", () => {
  it("crosses month and year ends", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("isoWeekday", () => {
  it("counts Monday as 1 and Sunday as 7", () => {
    expect(isoWeekday("2026-09-28")).toBe(1);
    expect(isoWeekday("2026-10-01")).toBe(4);
    expect(isoWeekday("2026-10-04")).toBe(7);
  });
});
