import { existsSync, readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CortexMark } from "@/components/brand/cortex-mark";
import { CortexLogoMotion } from "@/components/brand/cortex-logo-motion";

/*
  9 Kasım 2026, ürün sahibi yeni 3B logoyu verdi. İşaret tek dosyadan (`public/logo-mark.png`) geliyor:
  uygulamadaki işaret, hareketli logo; sekme, telefon ve paylaşım görselleri `src/app` altındaki statik
  PNG'ler. Bu test kodla çizilen eski işaretin (sinir ağı, C + yıldız) bir yerde geri kalmasını ve
  hareketin hareket azaltma ayarını yok saymasını yakalar.
*/

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

describe("yeni 3B logo", () => {
  it("işaret PNG'den, verilen boyutta ve dekoratif", () => {
    const html = renderToStaticMarkup(<CortexMark size={20} />);
    expect(html).toContain("logo-mark.png");
    expect(html).toContain('width="20"');
    expect(html).toContain('height="20"');
    expect(html).toContain('alt=""');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("<svg");
  });

  it("hareketli logo: yükleniyor hali ayrı sınıfta, ikisi de aynı işaret", () => {
    const intro = renderToStaticMarkup(<CortexLogoMotion size={120} />);
    const loop = renderToStaticMarkup(<CortexLogoMotion size={120} mode="loop" />);
    expect(intro).not.toContain("cxl--loop");
    expect(loop).toContain("cxl--loop");
    expect(loop).toContain("cxl-ring");
    for (const html of [intro, loop]) expect(html).toContain("logo-mark.png");
  });

  it("hareket azaltma açıkken logo ve ana sayfa durur", () => {
    expect(read("src/styles/brand-motion.css")).toMatch(/prefers-reduced-motion: reduce[\s\S]*animation: none !important/);
    expect(read("src/styles/landing.css")).toMatch(/prefers-reduced-motion: reduce[\s\S]*animation: none !important/);
  });

  it("simge ve paylaşım görselleri statik dosya; kodla çizen üreticiler kalmadı", () => {
    for (const path of [
      "src/app/favicon.ico",
      "src/app/icon.png",
      "src/app/apple-icon.png",
      "src/app/opengraph-image.png",
      "src/app/twitter-image.png",
      "public/icon-192.png",
      "public/icon-512.png",
      "public/icon-maskable-512.png",
      "public/logo-mark.png",
      "public/logo-full.png",
      "public/email/logo-email.png",
      "public/email/logo-email-white.png",
    ]) {
      expect(existsSync(path), path).toBe(true);
    }
    // Aynı adla .tsx ve .png birlikte olursa Next derlemede çakışır.
    for (const path of [
      "src/app/icon.tsx",
      "src/app/apple-icon.tsx",
      "src/app/opengraph-image.tsx",
      "src/app/twitter-image.tsx",
      "src/app/icon-maskable.png/route.tsx",
      "src/components/brand/cortex-icon-svg.tsx",
      "src/components/brand/cortex-geometry.ts",
    ]) {
      expect(existsSync(path), path).toBe(false);
    }
    expect(read("src/app/opengraph-image.alt.txt").trim()).toBe("Cortex Plus — Ders notundan sınav hazırlığı");
  });

  it("hazırlanıyor ekranı ve ana sayfanın son çağrısı hareketli logoyu kullanır", () => {
    expect(read("src/components/parity/node-generation-progress.tsx")).toContain('<CortexLogoMotion size={128} mode="loop" />');
    expect(read("src/components/landing/landing-page.tsx")).toContain("<CortexLogoReveal");
  });

  it("e-posta başlıkları mutlak https logo adresi, en/boy ve alt metni taşır", async () => {
    const { emailBrandHeader } = await import("@/lib/email/brand-header");
    const dark = emailBrandHeader("dark");
    const light = emailBrandHeader("light");
    expect(dark).toContain('src="https://cortexplus.app/email/logo-email.png"');
    expect(light).toContain('src="https://cortexplus.app/email/logo-email-white.png"');
    for (const html of [dark, light]) {
      expect(html).toContain('width="240" height="67" alt="Cortex Plus"');
      expect(html).toContain('role="presentation"');
    }
    expect(read("src/lib/email/mailer.ts")).toContain('emailBrandHeader("dark")');
    expect(read("src/lib/email/templates.ts")).toContain('emailBrandHeader("light")');
  });

  it("pazarlama menüsünde bozuk Türkçe karakter yok", () => {
    expect(read("src/components/marketing/parity-site-header.tsx")).not.toMatch(/Ã|Ä±|Å/);
  });

  it("uygulama üst çubuğu eski küçük harf cortex yazısını kullanmaz", () => {
    const shell = read("src/components/parity/sor-shell.tsx");
    expect(shell).toContain('className="cp-sor-logo-word"');
    expect(shell).toContain('className="cp-sor-logo-plus"');
    expect(shell).not.toContain('cp-sor-logo-word">cortex<');
    expect(shell).toContain("<CortexMark size={22} priority />");
    const css = read("src/styles/parity-shell.css");
    expect(css).toMatch(/\.cp-sor-top \{[\s\S]*?flex-wrap:\s*nowrap/);
    expect(css).toContain(".cp-sor-logo-plus");
  });
});
