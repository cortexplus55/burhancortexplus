import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/*
  Astra tasarım sistemi (17 Ekim 2026, ürün sahibinin kararı: yazı tipleri ve palet birebir).
  Canlıda yan yana ölçüldü: Astra Figtree + JetBrains Mono (etiketler) + Jersey 10 (karşılama)
  + Caveat ("hedef puan"); zemin #0d0d0d, yüzeyler #141414 / #1f1f1f, çerçeve #242424 / #303030,
  tek eylem mavisi #4353f3. Bizde eşaralıklı etiketler sistemin yazı tipine (Windows'ta
  Consolas) düşüyordu, "hedef puan" Segoe Print idi (yalnız Windows), zemin #050505'ti.
*/
const read = (path: string) => readFileSync(path, "utf8");
const block = (css: string, selector: string) => {
  const start = css.indexOf(`${selector} {`);
  return start < 0 ? "" : css.slice(start, css.indexOf("}", start));
};

describe("Astra tasarım sistemi", () => {
  it("dört yazı tipi kökte Türkçe alt kümeyle yüklenir", () => {
    const layout = read("src/app/layout.tsx");
    for (const font of ["Figtree", "JetBrains_Mono", "Jersey_10", "Caveat"]) expect(layout).toContain(font);
    expect(layout).toContain('variable: "--font-jetbrains-mono"');
    expect(layout).toContain('variable: "--font-pixel-face"');
    expect(layout).toContain('variable: "--font-hand-face"');
    expect(layout.match(/subsets: \["latin", "latin-ext"\]/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("koyu tema Astra paleti; odak ve eylem mavi", () => {
    const dark = block(read("src/styles/tokens.css"), ".dark");
    expect(dark).toContain("--c-bg: #0d0d0d;");
    expect(dark).toContain("--c-surface-1: #141414;");
    expect(dark).toContain("--c-surface-2: #1f1f1f;");
    expect(dark).toContain("--c-border: #242424;");
    expect(dark).toContain("--c-action: #4353f3;");
    expect(dark).toContain("--c-focus: #4353f3;");
    expect(dark).toContain("--c-success: #1dd3a2;");
    expect(dark).toContain("--c-brand: #fdb300;");
  });

  it("eşaralıklı etiketler sistem yazı tipine düşmez; el yazısı Caveat", () => {
    for (const file of readdirSync("src/styles").filter((name) => name.endsWith(".css") && name !== "tokens.css")) {
      const css = read(`src/styles/${file}`);
      expect(css, file).not.toMatch(/font-family:\s*ui-monospace/);
      expect(css, file).not.toContain("Segoe Print");
    }
    expect(read("src/styles/tokens.css")).toContain('--font-mono: var(--font-jetbrains-mono, "JetBrains Mono")');
  });

  it("durum renkleri Astra gibi: seçili menü gri, birincil düğme mavi, zemin düz, kayıtta altın yok", () => {
    const shell = read("src/styles/parity-shell.css");
    const activeNav = shell.slice(shell.indexOf(".cp-sor-topnav-link--active,\n.cp-sor-nav-link--active {"));
    expect(activeNav.slice(0, activeNav.indexOf("}"))).not.toMatch(/ffc857|--c-brand/);
    const root = shell.slice(shell.indexOf("  --cs-primary:"), shell.indexOf("  --cs-primary:") + 200);
    expect(root).toContain("--cs-primary: var(--c-action);");
    expect(root).toContain("background: var(--cp-bg);");
    expect(read("src/styles/parity-app.css")).not.toMatch(/\.cs-btn-primary \{\s*background: linear-gradient/);
    expect(read("src/styles/signup-wizard.css")).not.toMatch(/232, 168, 56|244, 174, 11|#e8a838|#f0b84d|#c9851f/);
    // Maviyle altının karıştığı geçiş kalmasın (eşleme betiği yalnız bir durağı çevirdiğinde oluyordu).
    for (const file of ["parity-shell.css", "parity-sor.css", "signup-wizard.css", "exam-create-wizard.css"]) {
      const gradients = read(`src/styles/${file}`).match(/linear-gradient\((?:[^()]|\([^()]*\))*\)/g) ?? [];
      for (const gradient of gradients) {
        if (gradient.includes("var(--c-action)")) expect(gradient, file).not.toMatch(/#(?:c9851f|f0b84d|d4922a|e8a838|ffc857|f4ae0b)/i);
      }
    }
  });

  it("karşılama piksel yazıyla; uygulama kabuğunda tırnaklı başlık yok", () => {
    const shell = read("src/styles/parity-shell.css");
    expect(block(shell, ".cp-sor-hero-title")).toContain("font-family: var(--font-pixel);");
    expect(block(shell, ".cp-sor-root")).toContain("--font-display: var(--font-ui");
    expect(read("src/app/deneme-sinavlari/[prepId]/sonuc/page.tsx")).not.toContain("Georgia, serif");
    expect(read("src/components/parity/mock-exam-setup.tsx")).not.toContain("Georgia, serif");
  });
});
