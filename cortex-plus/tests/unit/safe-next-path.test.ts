import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/auth/safe-next-path";

describe("safeNextPath", () => {
  it("kabul eder: göreli uygulama yolu", () => {
    expect(safeNextPath("/ogretmen")).toBe("/ogretmen");
    expect(safeNextPath("/dokumanlar/abc")).toBe("/dokumanlar/abc");
  });

  // Girişten sonra ev /dashboard: tek ana aksiyonun olduğu ekran.
  it("reddeder: protokol-relative ve mutlak URL", () => {
    expect(safeNextPath("//evil.com")).toBe("/dashboard");
    expect(safeNextPath("https://evil.com")).toBe("/dashboard");
    expect(safeNextPath("/\\evil.com")).toBe("/dashboard");
  });

  it("reddeder: boş / null → fallback", () => {
    expect(safeNextPath(null)).toBe("/dashboard");
    expect(safeNextPath("")).toBe("/dashboard");
    expect(safeNextPath("ogretmen")).toBe("/dashboard");
  });
});
