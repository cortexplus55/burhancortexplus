import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/auth/safe-next-path";

describe("safeNextPath", () => {
  it("kabul eder: göreli uygulama yolu", () => {
    expect(safeNextPath("/ogretmen")).toBe("/ogretmen");
    expect(safeNextPath("/dokumanlar/abc")).toBe("/dokumanlar/abc");
  });

  it("reddeder: protokol-relative ve mutlak URL", () => {
    expect(safeNextPath("//evil.com")).toBe("/ogretmen");
    expect(safeNextPath("https://evil.com")).toBe("/ogretmen");
    expect(safeNextPath("/\\evil.com")).toBe("/ogretmen");
  });

  it("reddeder: boş / null → fallback", () => {
    expect(safeNextPath(null)).toBe("/ogretmen");
    expect(safeNextPath("")).toBe("/ogretmen");
    expect(safeNextPath("ogretmen")).toBe("/ogretmen");
  });
});
