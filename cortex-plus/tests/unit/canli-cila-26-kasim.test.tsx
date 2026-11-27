// @vitest-environment jsdom
/**
 * Canlı tarayıcı denetiminin dört cilası (26 Kasım 2026).
 * - Fiyat kartları ve `/ozellikler`'in dönüşümlü bölümleri pazarlama sayfasının sıcak yüzeyinde ve ince kenarlıkta.
 * - Misafir sayfalarında sayfa geçiş çizgisi tıklama anında başlar (uygulamada 120 ms aynen), rengi logonun şeridi.
 * - `/kullanim-sartlari` kalıcı yönlendirmeyle `/kullanim-kosullari`.
 * - `sitemap.xml` ve `robots.txt` herkese açık sayfaları kapsar.
 */
import { existsSync, readFileSync } from "node:fs";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  document.body.querySelectorAll(".cinematic-marketing, .lp").forEach((node) => node.remove());
});

describe("site haritası ve robots", async () => {
  const { default: sitemap } = await import("@/app/sitemap");
  const { default: robots } = await import("@/app/robots");

  it("herkese açık sayfaların hepsi haritada", () => {
    const urls = new Set(sitemap().map((entry) => new URL(entry.url).pathname));
    for (const path of ["/", "/fiyatlandirma", "/ozellikler", "/mufredat", "/ornek", "/gizlilik", "/kullanim-kosullari", "/kvkk", "/hesap-silme"]) {
      expect(urls.has(path), path).toBe(true);
    }
    // Yönlenen eski adres haritada yok.
    expect(urls.has("/kullanim-sartlari")).toBe(false);
  });

  it("robots herkese açık sayfaları kapatmaz ve haritayı gösterir", () => {
    const rules = robots();
    const all = Array.isArray(rules.rules) ? rules.rules : [rules.rules];
    const rule = all.find((item) => item.userAgent === "*")!;
    expect(rule.allow).toBe("/");
    const disallow = ([] as string[]).concat(rule.disallow ?? []);
    // Search Console turunda (26 Kasım 2026) ödeme ve ayarlar, GEO turunda (27 Kasım 2026) öğretmen sohbeti, giriş ve
    // kayıt da kapandı; liste tek kaynakta (`crawl-rules.ts`).
    expect(disallow).toEqual(["/admin", "/api/", "/auth/", "/pay", "/ayarlar", "/ogretmen", "/giris", "/kayit"]);
    expect(rules.sitemap).toBe("https://cortexplus.app/sitemap.xml");
  });
});

describe("/kullanim-sartlari", () => {
  it("ayrı sayfa değil, kalıcı yönlendirme", () => {
    expect(existsSync("src/app/kullanim-sartlari/page.tsx")).toBe(false);
    expect(read("next.config.ts")).toContain('{ source: "/kullanim-sartlari", destination: "/kullanim-kosullari", permanent: true }');
  });
});

describe("sayfa geçiş çizgisi", async () => {
  const { NavigationProgress, progressShowDelay } = await import("@/components/layout/navigation-progress");

  function anchor(href: string) {
    const link = document.createElement("a");
    link.setAttribute("href", href);
    link.addEventListener("click", (event) => event.preventDefault());
    document.body.appendChild(link);
    return link;
  }

  it("misafir sayfalarında hemen, uygulamada 120 ms sonra", () => {
    expect(progressShowDelay(document)).toBe(120);
    const shell = document.createElement("div");
    shell.className = "cinematic-marketing";
    document.body.appendChild(shell);
    expect(progressShowDelay(document)).toBe(0);
    shell.className = "lp hm";
    expect(progressShowDelay(document)).toBe(0);
  });

  it("ana sayfada tıklama anında görünür; hızlı geçişte dolup kaybolur", () => {
    vi.useFakeTimers();
    const shell = document.createElement("div");
    shell.className = "lp hm";
    document.body.appendChild(shell);
    const view = render(<NavigationProgress />);
    const bar = view.container.querySelector(".cp-nav-progress") as HTMLElement;
    act(() => {
      anchor("/mufredat").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    });
    expect(bar.dataset.state).toBe("loading");
    act(() => {
      window.history.pushState(null, "", "/mufredat");
      vi.advanceTimersByTime(50);
    });
    expect(bar.dataset.state).toBe("done");
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(bar.dataset.state).toBe("idle");
    window.history.pushState(null, "", "/");
  });

  it("pazarlamada rengi logonun şeridi (mavi değil)", () => {
    const css = read("src/styles/parity-marketing.css");
    const rule = css.slice(css.indexOf(":root:has(:is(.cinematic-marketing, .lp)) .cp-nav-progress"));
    expect(rule).toContain("#ffb224 0%, #ff4d8d 36%, #8b5cf6 68%, #22d3ee 100%");
    expect(rule.slice(0, rule.indexOf("}"))).not.toMatch(/#4353f3|#3d5afe|var\(--c-action\)/);
  });
});

describe("kart ve bölüm yüzeyleri", () => {
  it("fiyat kartları koyu temada sayfanın sıcak yüzeyinde ve ince kenarlıkta", () => {
    const css = read("src/styles/parity-marketing.css");
    const start = css.indexOf(":root.dark .cinematic-marketing .cs-pay-card {");
    expect(start).toBeGreaterThan(0);
    const rule = css.slice(start, css.indexOf("}", start));
    expect(rule).toContain("--cs-surface: var(--cx-bg-1)");
    expect(rule).toContain("--cs-border: var(--cx-border)");
    expect(rule).not.toMatch(/#000\b|#000000|black/);
  });

  it("/ozellikler'in dönüşümlü bölümü soğuk nötr siyah değil, sıcak yüzey basamağı", () => {
    const css = read("src/styles/landing.css");
    const start = css.indexOf(".lp .lp-section--alt {");
    const rule = css.slice(start, css.indexOf("}", start));
    expect(rule).toContain("background: var(--lp-surface)");
    expect(rule).toContain("border-block: 1px solid var(--lp-border)");
    expect(rule).not.toContain("#0e0e10");
  });
});
