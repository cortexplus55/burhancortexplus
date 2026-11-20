import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

/** `@media print { … }` bloğunun gövdeleri (iç içe süslü parantezler sayılarak). */
function printBlocks(css: string): string {
  const out: string[] = [];
  let at = css.indexOf("@media print");
  while (at !== -1) {
    const open = css.indexOf("{", at);
    let depth = 0;
    let end = open;
    for (; end < css.length; end++) {
      if (css[end] === "{") depth++;
      else if (css[end] === "}" && --depth === 0) break;
    }
    out.push(css.slice(open + 1, end));
    at = css.indexOf("@media print", end);
  }
  return out.join("\n");
}

/* Faz 3 (20 Kasım 2026): sınav sabahı kâğıdının baskısı. */

describe("sınav sabahı baskısı", () => {
  const print = printBlocks(read("src/styles/cram-sheet.css"));

  it("bugünkü üst çubuk ve kabuk öğeleri baskıda yer kaplamaz (eski seçici de duruyor)", () => {
    const hidden = print.slice(0, print.indexOf("display: none !important"));
    for (const selector of [
      ".cp-sor-top",
      ".cx-home-top",
      ".cx-shell-back",
      ".cx-shell-close",
      ".cx-shell-countdown",
      ".cx-skip-link",
      ".cp-sor-bottomnav",
    ]) {
      expect(hidden, selector).toContain(`body:has(.cp-cram-sheet) ${selector}`);
    }
  });

  it("vurgular basılır: kâğıt tam renk ister, işaret baskıda açık gri", () => {
    expect(print).toContain("print-color-adjust: exact;");
    expect(print).toContain("-webkit-print-color-adjust: exact;");
    expect(print).toMatch(/\.cp-cram-sheet mark \{\n\s*background: #e3e3e3 !important;/);
  });

  it("uzun formül sütunu taşırmaz; paragraf sonunda tek satır kalmaz", () => {
    expect(print).toMatch(/\.cp-cram-sheet \.cp-uni-math,\n\s*\.cp-cram-sheet \.katex \{\n\s*white-space: normal !important;\n\s*overflow-wrap: anywhere;/);
    expect(print).toMatch(/orphans: 3;\n\s*widows: 3;/);
    // Ekranda formül tek satır kalır (yalnız baskı sarar).
    expect(read("src/styles/cram-sheet.css")).toMatch(/\.cp-uni-math \{[^}]*white-space: nowrap;/);
  });

  it("yazdırma kuralları yalnız kâğıt sayfasında (başka sayfa boş basılmasın)", () => {
    expect(print).not.toMatch(/^\s*body \* \{/m);
    expect(print).toContain("body:has(.cp-cram-sheet) * {");
  });
});
