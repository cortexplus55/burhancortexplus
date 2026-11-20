import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/auth/safe-next-path";

describe("safeNextPath", () => {
  it("kabul eder: göreli uygulama yolu", () => {
    expect(safeNextPath("/ogretmen")).toBe("/ogretmen");
    expect(safeNextPath("/dokumanlar/abc")).toBe("/dokumanlar/abc");
  });

  // Girişten sonra ev /ogretmen (6 Kasım 2026: eski /dashboard yönlendirme turu atlandı).
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

describe("safeNextPath: kodlanmış hileler (19 Kasım 2026, Faz 3)", () => {
  it.each([
    "/%2F%2Fevil.com",
    "/%2f%2fevil.com",
    "/%5Cevil.com",
    "/%5C%5Cevil.com",
    "/%09/evil.com",
    "/%252F%252Fevil.com",
    "/https%3A%2F%2Fevil.com",
    "/%E0%A4%A",
  ])("%s reddedilir", (raw) => {
    expect(safeNextPath(raw)).toBe("/ogretmen");
  });

  it("Türkçe karakterli ve sorgulu iç yollar kalır", () => {
    expect(safeNextPath("/deneme-sinavlari/olustur?kaynak=belge")).toBe("/deneme-sinavlari/olustur?kaynak=belge");
    expect(safeNextPath("/pay?kod=BETA-AB12-CD34")).toBe("/pay?kod=BETA-AB12-CD34");
    expect(safeNextPath("/mufredat/%C3%B6rnek")).toBe("/mufredat/%C3%B6rnek");
  });
});

describe("abonelik sayfası returnTo (19 Kasım 2026, Faz 3 denetimi)", () => {
  it("returnTo yalnız güvenli iç yoldan okunur", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/components/parity/subscription-cards.tsx", "utf8");
    expect(source).toContain('const returnTo = safeNextPath(searchParams.get("returnTo"), "") || null;');
    expect(source).not.toMatch(/const returnTo = searchParams\.get\("returnTo"\);/);
    expect(safeNextPath("https://evil.example", "") || null).toBeNull();
    expect(safeNextPath("/deneme-sinavlari/p1", "") || null).toBe("/deneme-sinavlari/p1");
  });
});
