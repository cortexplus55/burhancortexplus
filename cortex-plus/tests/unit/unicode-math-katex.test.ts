import { describe, expect, it } from "vitest";
import { texifyUnicodeMath } from "@/lib/text/unicode-math-to-tex";
import { renderMarkdownToHtml as renderMarkdown } from "@/lib/markdown";

/* Öğretmen v3 (21 Kasım 2026): düz yazılmış matematik ekranda gerçek KaTeX'e döner. Örnekler farklı derslerden. */

describe("düz matematik → KaTeX", () => {
  it("kök, çarpı ve eşittir tek formül olur; Türkçe ek dışarıda kalır", () => {
    expect(texifyUnicodeMath("√45 = √9 × √5 olur.")).toBe("$\\sqrt{45} = \\sqrt{9} \\times \\sqrt{5}$ olur.");
    expect(texifyUnicodeMath("√9'un değeri 3'tür.")).toBe("$\\sqrt{9}$'un değeri 3'tür.");
    expect(texifyUnicodeMath("Sonuç 3√5 çıkar.")).toBe("Sonuç $3\\sqrt{5}$ çıkar.");
    expect(texifyUnicodeMath("√20 sadeleşir")).toBe("$\\sqrt{20}$ sadeleşir");
    expect(texifyUnicodeMath("∛27 = 3")).toBe("$\\sqrt[3]{27} = 3$");
    expect(texifyUnicodeMath("√(x+1) ifadesi")).toBe("$\\sqrt{x+1}$ ifadesi");
  });

  it("çarpma, üslü denklem ve ondalık virgül", () => {
    expect(texifyUnicodeMath("4 × 5 = 20")).toBe("$4 \\times 5 = 20$");
    expect(texifyUnicodeMath("x² + 2x − 3 = 0 denklemi")).toBe("$x^{2} + 2x - 3 = 0$ denklemi");
    expect(texifyUnicodeMath("F = 2 × 9,8 eder")).toBe("$F = 2 \\times 9{,}8$ eder");
  });

  it("dokunulmayanlar: aralık, birim, tek başına üs, zaten formül, kod ve işaretler", () => {
    for (const text of [
      "Her gün 2-3 soru çöz.",
      "Hız 20 m/s², kütle 5 kg.",
      "x² tek başına kalır",
      "A ve B arasında kaldın.",
      "Zaten formül: $\\sqrt{2} \\times 3$ ve `√2 × 3` kodu.",
      "[[kaynak:Not|3|sayfa|/dokumanlar/1?page=3]] √2 × 3",
    ]) {
      const out = texifyUnicodeMath(text);
      if (text.startsWith("[[")) expect(out).toBe("[[kaynak:Not|3|sayfa|/dokumanlar/1?page=3]] $\\sqrt{2} \\times 3$");
      else expect(out).toBe(text);
    }
  });
});

describe("vurgu ve kalın içinde formül", () => {
  it("==$…$== kilit bilgi, **$…$** kalın olarak çizilir; çıplak işaret kalmaz", () => {
    const marked = renderMarkdown("Kural: ==$\\sqrt{a \\cdot b} = \\sqrt{a} \\cdot \\sqrt{b}$== her zaman geçerli.");
    expect(marked).toContain('<mark class="cp-key">');
    expect(marked).toContain("katex");
    expect(marked).not.toContain("==");
    const bold = renderMarkdown("Sonuç **$3\\sqrt{5}$** olur.");
    expect(bold).toMatch(/<strong>[\s\S]*katex[\s\S]*<\/strong>/);
    expect(bold).not.toContain("**");
  });

  it("metin + formül + metin aynı vurguda", () => {
    const html = renderMarkdown("==kök $\\sqrt{20}$ sadeleşir== dedik.");
    expect(html).toMatch(/<mark class="cp-key">kök [\s\S]*katex[\s\S]* sadeleşir<\/mark> dedik\./);
  });

  it("eski davranış: işaretsiz formül ve formülsüz vurgu aynen", () => {
    expect(renderMarkdown("==kilit bilgi== ve **terim**")).toContain('<mark class="cp-key">kilit bilgi</mark>');
    expect(renderMarkdown("a == b ve $x$")).toContain("a == b");
  });
});
