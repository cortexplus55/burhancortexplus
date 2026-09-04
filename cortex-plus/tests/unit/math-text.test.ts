import { describe, expect, it } from "vitest";
import { hasMath, renderMath, splitMath } from "@/lib/learning/math-text";
import { renderMarkdownToHtml } from "@/lib/markdown";

describe("splitMath", () => {
  it("satır içi formülü ayırır", () => {
    const segments = splitMath(
      "Türev $f'(x) = \\lim_{h \\to 0} \\frac{f(x+h)-f(x)}{h}$ olarak tanımlanır.",
    );
    const math = segments.filter((s) => s.type === "math");
    expect(math).toHaveLength(1);
    expect(math[0]).toMatchObject({ display: false });
    expect(math[0]!.value).toContain("\\lim");
  });

  // Model matematiği çoğunlukla köşeli/parantezli biçimle yazıyor. Ayırıcı
  // yalnızca dolar işaretine baktığı sürece ekranda ham LaTeX görünüyordu.
  it("köşeli blok biçimini tanır", () => {
    const segments = splitMath("Hesap:\n\\[\n2^3 = 8\n\\]");
    const math = segments.filter((s) => s.type === "math");
    expect(math).toHaveLength(1);
    expect(math[0]).toMatchObject({ display: true });
    expect(math[0]!.value).toContain("2^3");
  });

  it("parantezli satır içi biçimini tanır", () => {
    const segments = splitMath("Sonuç \\(x = 5\\) olur.");
    const math = segments.filter((s) => s.type === "math");
    expect(math).toHaveLength(1);
    expect(math[0]).toMatchObject({ display: false, value: "x = 5" });
  });

  it("köşeli biçimden sonra metin kaybolmuyor", () => {
    const segments = splitMath("Önce \\[a+b\\] sonra devam.");
    expect(segments.map((s) => s.type)).toEqual(["text", "math", "text"]);
    expect(segments[2]).toMatchObject({ value: " sonra devam." });
  });

  it("blok formülü display olarak işaretler", () => {
    const segments = splitMath("Sonuç:\n$$\\int_0^1 x^2\\,dx = \\frac{1}{3}$$");
    const math = segments.filter((s) => s.type === "math");
    expect(math).toHaveLength(1);
    expect(math[0]).toMatchObject({ display: true });
  });

  it("aynı metindeki birden fazla formülü ayırır", () => {
    const segments = splitMath("$a^2 + b^2 = c^2$ ve $E = mc^2$ iki formül");
    expect(segments.filter((s) => s.type === "math")).toHaveLength(2);
  });

  // Tek `$` para birimi olarak da kullanılıyor; yanlış eşleşme metni bozardı.
  it("para birimi olarak kullanılan dolar işaretini formül sanmaz", () => {
    expect(splitMath("Fiyat 5 $ ile 10 $ arasında.").every((s) => s.type === "text")).toBe(
      true,
    );
    expect(splitMath("Maliyet $ 100 olur.").every((s) => s.type === "text")).toBe(true);
  });

  it("matematiksiz metni tek parça bırakır", () => {
    const segments = splitMath("Burada hiç formül yok.");
    expect(segments).toEqual([{ type: "text", value: "Burada hiç formül yok." }]);
  });

  it("hasMath yalnızca gerçek adaylarda true döner", () => {
    expect(hasMath("$x^2$")).toBe(true);
    expect(hasMath("düz metin")).toBe(false);
  });
});

describe("renderMath", () => {
  it("KaTeX işaretlemesi üretir", () => {
    const html = renderMath("x^2", false);
    expect(html).toContain("katex");
  });

  it("hatalı LaTeX'te çökmez", () => {
    expect(() => renderMath("\\frac{", false)).not.toThrow();
  });

  // trust:false olduğu için \href gibi HTML enjekte eden komutlar geçmemeli.
  it("HTML enjekte eden komutları geçirmez", () => {
    const html = renderMath("\\href{javascript:alert(1)}{tikla}", false);
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<a ");
  });
});

describe("renderMarkdownToHtml", () => {
  it("formülü KaTeX'e verir, düz metni escape eder", () => {
    const html = renderMarkdownToHtml("Şu $x^2$ formülü ve <script>kötü</script> metin");
    expect(html).toContain("katex");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("formül içindeki ters bölü karakterlerini bozmaz", () => {
    const html = renderMarkdownToHtml("$\\frac{a}{b}$");
    // Escape edilmiş hâli görünmemeli — formül gövdesi KaTeX'e ham gitmeli.
    expect(html).not.toContain("\\frac{a}{b}");
    expect(html).toContain("katex");
  });

  it("mevcut markdown davranışını korur", () => {
    expect(renderMarkdownToHtml("**kalın**")).toContain("<strong>kalın</strong>");
    expect(renderMarkdownToHtml("- bir\n- iki")).toContain("<li>bir</li>");
    expect(renderMarkdownToHtml("## Başlık")).toContain("font-semibold");
  });
});
