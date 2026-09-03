import { describe, expect, it } from "vitest";
import {
  APP_FRAME_CSP,
  extractAppDocument,
  withFrameCsp,
} from "@/lib/parity/user-app";

const APP = `<!DOCTYPE html><html lang="tr"><head><title>Sayı Tahmini</title></head>
<body><h1>Tut bir sayı</h1><script>let n=1;document.title=n;</script>
${"<p>dolgu</p>".repeat(20)}</body></html>`;

describe("extractAppDocument", () => {
  it("düz belgeyi kabul eder", () => {
    expect(extractAppDocument(APP)).toContain("<title>Sayı Tahmini</title>");
  });

  it("kod çitini soyar", () => {
    const fenced = "```html\n" + APP + "\n```";
    expect(extractAppDocument(fenced)).toContain("<html");
  });

  it("belgeden önceki açıklamayı atar", () => {
    const noisy = "İşte istediğin uygulama:\n\n" + APP;
    const out = extractAppDocument(noisy);
    expect(out?.startsWith("<!DOCTYPE")).toBe(true);
  });

  it("belgeden sonraki açıklamayı keser", () => {
    const out = extractAppDocument(APP + "\n\nUmarım beğenirsin!");
    expect(out?.endsWith("</html>")).toBe(true);
  });

  it("html olmayan çıktıyı reddeder", () => {
    expect(extractAppDocument("Merhaba, bunu yapamam.")).toBeNull();
    expect(extractAppDocument("")).toBeNull();
  });

  it("çalışacak bir şey içermeyen belgeyi reddeder", () => {
    const inert = `<html><head><title>x</title></head><body>${"<p>a</p>".repeat(40)}</body></html>`;
    expect(extractAppDocument(inert)).toBeNull();
  });

  it("aşırı büyük belgeyi reddeder", () => {
    const huge = `<html><body><script>${"x".repeat(250000)}</script></body></html>`;
    expect(extractAppDocument(huge)).toBeNull();
  });
});

describe("withFrameCsp", () => {
  it("mevcut head'e CSP meta'sı ekler", () => {
    const out = withFrameCsp(APP);
    expect(out).toContain('http-equiv="Content-Security-Policy"');
    expect(out.indexOf("Content-Security-Policy")).toBeLessThan(
      out.indexOf("</head>"),
    );
  });

  it("head yoksa açar", () => {
    const noHead = "<html><body><script>1</script></body></html>";
    const out = withFrameCsp(noHead);
    expect(out).toContain("<head>");
    expect(out).toContain("Content-Security-Policy");
  });

  /**
   * Bu politikanın gevşemesi, üretilen uygulamaların dışarıya veri
   * sızdırabilmesi demek. Testi kırıldığında gevşetmeden önce iki kez düşün.
   */
  it("ağ erişimine kapalı kalır", () => {
    expect(APP_FRAME_CSP).toContain("default-src 'none'");
    expect(APP_FRAME_CSP).not.toContain("connect-src");
    expect(APP_FRAME_CSP).toContain("form-action 'none'");
    // Uzak kaynak izni hiçbir yönergede olmamalı.
    expect(APP_FRAME_CSP).not.toMatch(/https?:/);
    expect(APP_FRAME_CSP).not.toContain("*");
  });
});
