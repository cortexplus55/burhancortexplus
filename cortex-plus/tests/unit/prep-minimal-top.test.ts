import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/*
  13 Kasım 2026 (kabuk, ürün sahibinin kararı): hazırlık sayfası da bütün öğrenci sayfalarıyla aynı üst çubukta.
  17 Ekim 2026'daki "sade üst çubuk" (yalnız Geri ve sayfanın simgeleri; seri, menü, avatar yok) ve yapışkan odak
  çubuğu bilerek değişti: gezinme sekmelerden, sayfanın simgeleri sayfanın başında.
*/
describe("hazırlık sayfası üst çubuğu", () => {
  it("sayfa odak kabuğunda; kabuk odakta da aynı üst çubuğu çizer", () => {
    const page = readFileSync("src/app/deneme-sinavlari/[prepId]/page.tsx", "utf8");
    expect(page).toContain('chrome="focus" backHref="/deneme-sinavlari" minimalTop');
    const shell = readFileSync("src/components/parity/sor-shell.tsx", "utf8");
    expect(shell).toContain('const showTopBar = chrome !== "session";');
    expect(shell).not.toContain("planInCapsule");
    expect(shell).not.toContain("minimalTop ? null");
  });

  it("yolun sekmeleri yeni çubukta ekranın üstüne yapışır (eski yapışkan çubuğun altına değil)", () => {
    const shell = readFileSync("src/components/parity/sor-shell.tsx", "utf8");
    expect(shell).toContain('minimalTop && "cp-sor-root--minimal-top"');
    const css = readFileSync("src/styles/cx-shell.css", "utf8");
    expect(css).toMatch(/\.cp-sor-root:has\(> \.cx-home-top\) \.cp-prep-tabbar \{\s+top: env\(safe-area-inset-top, 0px\);/);
  });
});
