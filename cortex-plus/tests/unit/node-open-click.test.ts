import { describe, expect, it } from "vitest";
import { markNodeClick, markNodeClickIfMissing, takeNodeClick } from "@/lib/learning/node-open-click";

function mem() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

describe("düğüm açılış tıklaması (3 Kasım 2026)", () => {
  it("taze tıklamayı bir kez verir", () => {
    const s = mem();
    markNodeClick(1_000, s);
    expect(takeNodeClick(1_500, s)).toBe(1_000);
    expect(takeNodeClick(1_600, s)).toBeNull();
  });
  it("bayat tıklama sayılmaz; yükleniyor kabuğu yalnız kayıt yoksa yazar", () => {
    const s = mem();
    markNodeClick(1_000, s);
    markNodeClickIfMissing(2_000, s);
    expect(takeNodeClick(2_100, s)).toBe(1_000);
    markNodeClick(1_000, s);
    expect(takeNodeClick(60_000, s)).toBeNull();
  });
});
