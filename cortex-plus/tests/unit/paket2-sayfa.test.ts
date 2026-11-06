import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
  Paket 2 sayfa düzeni (6 Kasım 2026, 360° denetim):
  - Tırnaklı başlık yazısı (DM Serif Display) hiçbir yerde yüklenmez ve kullanılmaz; `--font-display` Figtree.
  - /ornek öbür pazarlama sayfalarıyla aynı kabukta (logo, menü, alt bilgi); birincil düğme mavi.
  - Pazarlama menüsü 768 px tablette iki satıra kırılmasın diye tam menü 1024 px'te açılır.
  - Fiyat ve abonelik sayfasında satın alma düğmesi karşılaştırma tablosundan önce gelir.
*/

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : /\.(ts|tsx|css)$/.test(name) ? [full] : [];
  });
}

describe("tırnaklı başlık yazısı kalktı", () => {
  it("DM Serif yüklenmiyor ve hiçbir stil ona bağlanmıyor", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout).not.toMatch(/DM_Serif_Display\s*\(/);
    expect(layout).not.toMatch(/import \{[^}]*DM_Serif_Display/);
    const offenders = walk("src").filter((file) => {
      const text = read(file);
      return /font-family:[^;]*DM Serif|'DM Serif Display'/.test(text);
    });
    expect(offenders).toEqual([]);
    expect(read("src/styles/tokens.css")).toMatch(/--font-display:\s*var\(--font-ui\)/);
  });
});

describe("/ornek", () => {
  it("ortak pazarlama kabuğunda; kendi başlık çubuğu ve düz yazı logosu yok", () => {
    const page = read("src/app/ornek/page.tsx");
    expect(page).toContain("<ParityMarketingPage>");
    expect(page).not.toContain("dm-topbar");
    expect(page).not.toContain("dm-brand");
  });

  it("birincil düğme mavi (altın yalnız marka ve Plus)", () => {
    const css = read("src/styles/demo.css");
    const block = css.slice(css.indexOf(".dm-btn--primary {"), css.indexOf("}", css.indexOf(".dm-btn--primary {")));
    expect(block).toMatch(/background:\s*var\(--c-action/);
    expect(block).not.toMatch(/amber/);
  });
});

describe("pazarlama menüsü", () => {
  it("tam menü 1024 px'te açılır, altında hamburger; öğeler satır kırmaz", () => {
    const header = read("src/components/marketing/parity-site-header.tsx");
    expect(header).toMatch(/whitespace-nowrap text-sm text-\[var\(--mk-muted\)\] lg:flex/);
    expect(header).not.toMatch(/\bmd:flex\b/);
    expect(header).not.toMatch(/\bmd:hidden\b/);
    expect((header.match(/lg:hidden/g) ?? []).length).toBe(2);
  });
});

describe("fiyat sayfası sırası", () => {
  it("karşılaştırma tablosu plan kartlarından sonra ve açılır-kapanır", () => {
    const cards = read("src/components/parity/subscription-cards.tsx");
    const buy = cards.indexOf("Plus'a yükselt");
    const toggle = cards.indexOf("Planların tüm farklarını gör");
    const table = cards.indexOf('className="tier-compare-cards"');
    expect(buy).toBeGreaterThan(0);
    expect(toggle).toBeGreaterThan(buy);
    expect(table).toBeGreaterThan(toggle);
    expect(cards).toMatch(/\{compareOpen \? \(\s*<div id="tier-compare-panel"/);
  });
});
