import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CortexMark } from "@/components/brand/cortex-mark";
import { CortexLogoMotion } from "@/components/brand/cortex-logo-motion";
import { NETWORK_MARK, SMALL_MARK } from "@/components/brand/cortex-geometry";

/*
  19 Ekim 2026, ürün sahibi logo adaylarından "B, sinir ağı"nı seçti. İşaret tek kaynaktan
  (`cortex-geometry.ts`) çiziliyor: uygulamadaki işaret, hareketli logo, sekme ve telefon simgesi,
  paylaşım görseli. Bu test eski "C + yıldız" çiziminin bir yerde geri kalmasını ve hareketin
  hareket azaltma ayarını yok saymasını yakalar.
*/

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
/** `<line` ile `<linearGradient` karışmasın: etiket adından sonra boşluk, `/` ya da `>` gelir. */
const count = (html: string, tag: string) => html.match(new RegExp(`<${tag}[ />]`, "g"))?.length ?? 0;

describe("sinir ağı işareti", () => {
  it("küçük boyutta altı düğüm ve artı", () => {
    const html = renderToStaticMarkup(<CortexMark size={20} />);
    expect(count(html, "circle")).toBe(SMALL_MARK.nodes.length);
    expect(SMALL_MARK.nodes).toHaveLength(6);
    expect(html).toContain("<polyline");
  });

  it("40 piksel ve üstünde ağın tamamı", () => {
    const html = renderToStaticMarkup(<CortexMark size={64} />);
    expect(count(html, "circle")).toBe(NETWORK_MARK.outer.length + NETWORK_MARK.inner.length);
    expect(count(html, "line")).toBe(NETWORK_MARK.links.length);
  });

  it("hareketli logo: her düğüm sırasını taşır, yükleniyor hali ayrı sınıfta", () => {
    const intro = renderToStaticMarkup(<CortexLogoMotion size={120} />);
    const loop = renderToStaticMarkup(<CortexLogoMotion size={120} mode="loop" />);
    expect(intro).not.toContain("cxl--loop");
    expect(loop).toContain("cxl--loop");
    expect(count(intro, "circle")).toBe(16);
    expect(intro.match(/--k:/g)?.length).toBe(16 + NETWORK_MARK.links.length + 1);
  });

  it("hareket azaltma açıkken logo ve ana sayfa durur", () => {
    expect(read("src/styles/brand-motion.css")).toMatch(/prefers-reduced-motion: reduce[\s\S]*animation: none !important/);
    expect(read("src/styles/landing.css")).toMatch(/prefers-reduced-motion: reduce[\s\S]*animation: none !important/);
  });

  it("eski C + yıldız çizimi hiçbir yerde kalmadı", () => {
    for (const path of [
      "src/components/brand/cortex-mark.tsx",
      "src/app/icon.tsx",
      "src/app/apple-icon.tsx",
      "src/app/opengraph-image.tsx",
    ]) {
      expect(read(path), path).not.toContain("M18.4 5.4");
    }
    expect(read("src/app/icon.tsx")).toContain("CortexIconSvg");
    expect(read("src/app/apple-icon.tsx")).toContain("CortexIconSvg");
    expect(read("src/app/opengraph-image.tsx")).toContain("CortexIconSvg");
  });

  it("hazırlanıyor ekranı ve ana sayfanın son çağrısı hareketli logoyu kullanır", () => {
    expect(read("src/components/parity/node-generation-progress.tsx")).toContain('<CortexLogoMotion size={168} mode="loop" />');
    expect(read("src/components/landing/landing-page.tsx")).toContain("<CortexLogoReveal");
  });

  it("pazarlama menüsünde bozuk Türkçe karakter yok", () => {
    expect(read("src/components/marketing/parity-site-header.tsx")).not.toMatch(/Ã|Ä±|Å/);
  });
});
