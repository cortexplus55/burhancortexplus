// @vitest-environment jsdom
/*
  Paket 3 kalite (6 Kasım 2026): KaTeX ağırlığı.
  - Biçim (`katex.min.css`) kök düzende değil; formül çizen modül ve bileşenler kendisi alır.
  - Bileşenler KaTeX'i doğrudan değil tek kapıdan alır (`useMathRenderer`); metin KaTeX'siz `math-split.ts` ile ayrılır.
    Tembel yükleme denendi ve geri alındı (sunucu çizimi ham TeX'e düşüyordu); çizim sunucu yoluyla birebir aynı.
*/
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MathText } from "@/components/learning/math-text";
import { Markdown } from "@/components/markdown";
import { RichBody } from "@/components/parity/lesson-rich-text";
import { ExamLessonBodyLazy } from "@/components/parity/exam-lesson-body-lazy";
import { ExamLessonBody } from "@/components/parity/exam-lesson-body";
import * as split from "@/lib/learning/math-split";
import * as mathText from "@/lib/learning/math-text";
import { renderMarkdownToHtml } from "@/lib/markdown";
import { renderMarkdownWith } from "@/lib/markdown-core";
import { renderToStaticMarkup } from "react-dom/server";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const KATEX_CSS = 'import "katex/dist/katex.min.css";';

describe("KaTeX biçimi kökte değil, formül çizenlerde", () => {
  it("layout.tsx katex biçimini içe aktarmaz", () => {
    expect(read("src/app/layout.tsx")).not.toMatch(/import\s+["']katex/);
  });

  it.each([
    "src/lib/learning/math-text.ts",
    "src/components/learning/math-text.tsx",
    "src/components/parity/lesson-rich-text.tsx",
    "src/components/markdown.tsx",
    "src/components/parity/exam-lesson-body.tsx",
    "src/components/parity/exam-lesson-body-lazy.tsx",
    "src/components/parity/video-lesson.tsx",
  ])("%s katex biçimini alır", (file) => {
    expect(read(file)).toContain(KATEX_CSS);
  });
});

describe("bileşenler KaTeX'i yalnız useMathRenderer kapısından alır", () => {
  it.each([
    "src/lib/learning/math-split.ts",
    "src/lib/markdown-core.ts",
    "src/components/parity/exam-lesson-body-view.tsx",
    "src/components/learning/math-text.tsx",
    "src/components/parity/lesson-rich-text.tsx",
    "src/components/markdown.tsx",
    "src/components/parity/exam-lesson-body-lazy.tsx",
  ])("%s ne katex'i ne math-text'i statik içe aktarır", (file) => {
    const source = read(file);
    expect(source).not.toMatch(/from\s+["']katex/);
    expect(source).not.toMatch(/import\s+["']katex\/contrib/);
    expect(source).not.toMatch(/from\s+["']@\/lib\/learning\/math-text["']/);
    expect(source).not.toMatch(/from\s+["']@\/lib\/markdown["']/);
  });

  it("çizici eşzamanlı: sunucuda çizilen formül hidrasyondan sonra ham TeX'e düşmez", () => {
    // 6 Kasım 2026: tembel yükleme denendi; örnek ders sayfasının formül kartı ve sınav sabahı kâğıdı bir an ham
    // TeX gösterdi. Çizici yine statik; kazanç CSS'in kökten çıkması ve KaTeX'siz yardımcıların ayrılması.
    const hook = read("src/components/learning/use-math-renderer.ts");
    expect(hook).toContain('import * as mathText from "@/lib/learning/math-text"');
    expect(hook).not.toContain('import("@/lib/learning/math-text")');
  });

  it("math-text eski dışa aktarımları aynı işlevlerle sürdürür", () => {
    expect(mathText.splitMath).toBe(split.splitMath);
    expect(mathText.hasMath).toBe(split.hasMath);
    expect(mathText.escapeHtml).toBe(split.escapeHtml);
    expect(mathText.textifyFormulaWords).toBe(split.textifyFormulaWords);
  });
});

describe("tembel çizim sonucu eşzamanlı yolla aynı", () => {
  it("MathText: formülsüz metin hemen kaçışlı düz metin", () => {
    const { container } = render(<MathText text="a < b ve 5 $ indirim" />);
    expect(container.innerHTML).toContain("a &lt; b");
    expect(container.innerHTML).not.toContain("katex");
  });

  it("MathText: formül yüklenince KaTeX", async () => {
    const { container } = render(<MathText text="Alan $x^2$ olur" />);
    await waitFor(() => expect(container.innerHTML).toContain("katex"));
    expect(container.querySelector("span")?.innerHTML).toContain(mathText.renderMath("x^2", false));
  });

  it("RichBody: formül yüklenince KaTeX, metin vurgusu aynı", async () => {
    const { container } = render(<RichBody text={"**Kural:** $\\frac{a}{b}$ kesirdir"} />);
    await waitFor(() => expect(container.innerHTML).toContain("katex"));
    expect(container.querySelector("strong")?.textContent).toBe("Kural:");
    expect(container.innerHTML).toContain(mathText.renderMath("\\frac{a}{b}", false));
  });

  it("Markdown: sohbet bileşeni sunucu çiziciyle aynı HTML'e varır", async () => {
    const content = "## Başlık\n\n$$E = mc^2$$\n\n- bir $a+b$\n- iki";
    const { container } = render(<Markdown content={content} />);
    await waitFor(() => expect(container.innerHTML).toContain("katex"));
    expect(container.firstElementChild?.innerHTML).toBe(renderMarkdownToHtml(content));
  });

  it("renderMarkdownToHtml = çekirdek + KaTeX", () => {
    const content = "| a | b |\n|---|---|\n| $x$ | **y** |";
    expect(renderMarkdownToHtml(content)).toBe(renderMarkdownWith(content, mathText.renderMath));
  });

  it("ExamLessonBodyLazy yüklenince sunucu sürümüyle aynı", async () => {
    const content = "## Ders\n\n**Cortex:** $a^2 + b^2$ toplamı\n\n- madde $c$";
    const serverHtml = renderToStaticMarkup(<ExamLessonBody content={content} />);
    const { container } = render(<ExamLessonBodyLazy content={content} />);
    await waitFor(() => expect(container.innerHTML).toContain("katex"));
    expect(container.innerHTML).toBe(serverHtml);
  });
});
