import { describe, expect, it } from "vitest";
import { readSavedSignals, saveSignalsChoice, signalsChoiceKey } from "@/lib/learning/lesson-open";

function mem() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}

describe("açılış seçimi aynı gün aynı hazırlıkta hatırlanır", () => {
  const now = new Date("2026-11-03T08:00:00+03:00");
  it("aşinalık ve ruh hali birleşir; başka hazırlık ve başka gün etkilenmez", () => {
    const s = mem();
    saveSignalsChoice(s, "p1", { familiarity: "basics" }, now);
    saveSignalsChoice(s, "p1", { mood: "focused" }, now);
    expect(readSavedSignals(s, "p1", now)).toEqual({ familiarity: "basics", mood: "focused" });
    expect(readSavedSignals(s, "p2", now)).toBeNull();
    expect(readSavedSignals(s, "p1", new Date("2026-11-04T08:00:00+03:00"))).toBeNull();
  });
  it("bozuk kayıt ve geçersiz düzey yok sayılır", () => {
    const s = mem();
    s.setItem(signalsChoiceKey("p1", now), "{bozuk");
    expect(readSavedSignals(s, "p1", now)).toBeNull();
    s.setItem(signalsChoiceKey("p1", now), JSON.stringify({ familiarity: "x" }));
    expect(readSavedSignals(s, "p1", now)).toBeNull();
    expect(readSavedSignals(null, "p1", now)).toBeNull();
  });
});
