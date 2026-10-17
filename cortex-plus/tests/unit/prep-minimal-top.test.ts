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

// 17 Ekim 2026 canlıda: üst çubuk kayıp gidiyordu, sekme şeridinin üstünde kalan boşluktan
// yolun düğümü görünüyordu. Astra'da Geri ve simgeler yerinde kalıyor.
describe("hazırlık sayfası yapışkan üst çubuk", () => {
  it("sade üst çubuk sabit; sekmeler tam altında", () => {
    const shell = readFileSync("src/components/parity/sor-shell.tsx", "utf8");
    expect(shell).toContain('minimalTop && "cp-sor-root--minimal-top"');
    const css = readFileSync("src/styles/parity-shell.css", "utf8");
    expect(css).toMatch(/\.cp-sor-root--minimal-top \.cp-sor-top \{\s+position: sticky;\s+top: 0;/);
    expect(css).toContain("top: calc(env(safe-area-inset-top, 0px) + 3.95rem);");
  });
});
