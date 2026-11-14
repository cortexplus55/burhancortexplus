import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/*
  Giriş ve kayıt sol paneli (15 Kasım 2026, ürün sahibi: "soldaki yazı aşağıda kalmış, tasarım dilimizle tasarla").
  Yeni görünümde (`ui.v2.giris`) başlık grubu dikeyde ortada, altın yok, logo üst çubuktaki dosya; eski görünümde yeni
  parçalar gizli. Metin değişmedi.
*/
const read = (path: string) => readFileSync(path, "utf8");
const css = read("src/styles/ui-v2-giris.css");
const base = read("src/styles/cortex-premium.css");

describe("sol panel", () => {
  it("başlık grubu ortada: başlık üstten, rozetler alttan otomatik boşlukla; panel kayarken yerinde", () => {
    expect(css).toMatch(/\.cortex-premium-auth__hero-title \{[^}]*margin-top: auto;/);
    expect(css).toMatch(/\.cortex-premium-auth__badges \{[^}]*margin-bottom: auto;/);
    expect(css).toMatch(/\.cortex-premium-auth__hero \{[^}]*position: sticky;/);
  });

  it("altın yok, kenarlıksız bg-1 kart, iki tonlu başlık", () => {
    const section = css.slice(css.indexOf("Kabuk: giriş, kayıt"));
    expect(section).not.toMatch(/cpx-gold|--cx-highlight/);
    expect(css).toMatch(/\.cortex-premium-auth__hero-inner \{[^}]*background: var\(--cx-gradient-glow\), var\(--cx-bg-1\);/);
    expect(css).toMatch(/\.cortex-premium-auth__hero-title \.cx-auth-tone \{\s*color: var\(--cx-text-secondary\);/);
    for (const shell of ["signup-premium-shell", "premium-auth-shell"]) {
      expect(read(`src/components/layout/${shell}.tsx`)).toContain('<span className="cx-auth-tone">');
    }
  });

  it("logo üst çubuktaki dosya; ekranda tek logo (geniş ekranda panelde, telefonda üstte)", () => {
    expect(read("src/components/layout/auth-brand.tsx")).toContain('src="/logo-mark-trim.png"');
    expect(css).toMatch(/\.cx-auth-mark,[\s\S]*?display: none;/);
    expect(css).toMatch(/@media \(min-width: 1024px\) \{[\s\S]*?\.cx-auth-logo--head \{\s*display: none;/);
  });

  it("eski görünümde yeni parçalar gizli (bayrak kapalıyken görünüş aynı)", () => {
    expect(base).toMatch(/\.cx-auth-logo,\s*\.cx-auth-ring,\s*\.cx-auth-badge-icon \{\s*display: none;/);
  });
});

describe("kayıt adımları", () => {
  it("sınıf hapları tek satır ve sarar; telefonda hedef kartları tek sütun", () => {
    expect(css).toMatch(/\.grid\.grid-cols-3 > \.signup-choice \{[^}]*white-space: nowrap;/);
    expect(css).toMatch(/@media \(max-width: 480px\) \{[\s\S]*?\.grid\.grid-cols-2 \{\s*grid-template-columns: minmax\(0, 1fr\);/);
  });

  it("Devam ekranın tek marka düğmesi; pasifken bg-2", () => {
    expect(css).toMatch(/\.signup-wizard \.signup-continue \{[^}]*background: var\(--cx-gradient-brand\);/);
    expect(css).toMatch(/\.signup-continue:disabled \{[^}]*background: var\(--cx-bg-2\);/);
  });
});
