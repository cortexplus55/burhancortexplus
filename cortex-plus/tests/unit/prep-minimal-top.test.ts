import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// 17 Ekim 2026, Astra ile yan yana: hazırlık sayfasının üst çubuğunda yalnız Geri ve
// sayfanın simgeleri var; seri, menü, avatar ve kurucu rozeti yok.
describe("hazırlık sayfası sade üst çubuk", () => {
  it("sayfa sade üst çubuğu ister; kabuk seri, menü ve avatarı gizler", () => {
    const page = readFileSync("src/app/deneme-sinavlari/[prepId]/page.tsx", "utf8");
    expect(page).toContain('chrome="focus" backHref="/deneme-sinavlari" minimalTop');
    const shell = readFileSync("src/components/parity/sor-shell.tsx", "utf8");
    expect(shell).toContain("{minimalTop ? null : isAdmin && account ? (");
    expect(shell).toMatch(/\{minimalTop \? null : \(\s*<>\s*<button\s+type="button"\s+className="cp-sor-streak"/);
  });
});
