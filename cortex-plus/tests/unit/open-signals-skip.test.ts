import { describe, expect, it } from "vitest";
import { markSignalsSkipped, signalsSkippedToday } from "@/lib/learning/lesson-open";

describe("açılış kartı atlama", () => {
  it("atlanan gün yeniden sorulmaz, ertesi gün sorulur", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    const day = new Date("2026-11-03T09:00:00+03:00");
    expect(signalsSkippedToday(storage, day)).toBe(false);
    markSignalsSkipped(storage, day);
    expect(signalsSkippedToday(storage, day)).toBe(true);
    expect(signalsSkippedToday(storage, new Date("2026-11-04T09:00:00+03:00"))).toBe(false);
    expect(signalsSkippedToday(null, day)).toBe(false);
  });
});
