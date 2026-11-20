import { describe, expect, it } from "vitest";
import QRCode from "qrcode";
import { qrMatrix, qrSvgDataUri, qrSvgMarkup } from "@/lib/utils/qr-svg";

/* Faz 7 (20 Kasım 2026): yerel, deterministik SVG QR kodu — ağ isteği yok, aynı veri aynı çizim. */

const URL = "https://cortexplus.app/davet/K7M2QX9A";

describe("yerel SVG QR kodu", () => {
  it("aynı veri her seferinde aynı SVG'yi verir; farklı veri farklı çizim", () => {
    expect(qrSvgMarkup(URL)).toBe(qrSvgMarkup(URL));
    expect(qrSvgMarkup(URL)).not.toBe(qrSvgMarkup(`${URL}0`));
  });

  it("matris paketin kodlayıcısıyla birebir; koyu modül sayısı çizimdeki şeritlerin toplamı", () => {
    const matrix = qrMatrix(URL);
    const reference = QRCode.create(URL, { errorCorrectionLevel: "M" });
    expect(matrix.size).toBe(reference.modules.size);
    let dark = 0;
    for (let row = 0; row < matrix.size; row += 1)
      for (let col = 0; col < matrix.size; col += 1) {
        expect(matrix.isDark(row, col)).toBe(Boolean(reference.modules.get(row, col)));
        if (matrix.isDark(row, col)) dark += 1;
      }
    const svg = qrSvgMarkup(URL, { margin: 2 });
    const widths = [...svg.matchAll(/h(\d+)v1h-\d+z/g)].map((match) => Number(match[1]));
    expect(widths.reduce((sum, width) => sum + width, 0)).toBe(dark);
    expect(svg).toContain(`viewBox="0 0 ${matrix.size + 4} ${matrix.size + 4}"`);
  });

  it("ağ adresi yok (http yalnız SVG ad alanında); başlık kaçışlı; data URI istemcide de çalışır", () => {
    const svg = qrSvgMarkup(URL, { title: 'Davet <"QR">' });
    expect(svg.replace("http://www.w3.org/2000/svg", "")).not.toMatch(/https?:\/\//);
    expect(svg).toContain("<title>Davet &lt;&quot;QR&quot;&gt;</title>");
    expect(qrSvgDataUri(URL).startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(() => qrMatrix("")).toThrow("qr_empty");
  });
});
