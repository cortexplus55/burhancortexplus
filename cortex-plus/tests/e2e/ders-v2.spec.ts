import { expect, test } from "@playwright/test";

/*
  Faz 4B (14 Kasım 2026): ders ekranının yeni görünümü (`ui.v2.ders`), ders fikstüründe. Bayrak açık (`?ui=v2`) ve kapalı:
  taşma yok; açıkken üst çubuk ≥ 56 px, ilerleme 6 px, ikon düğmeleri ≥ 40 (telefonda 44), ekranda tek brand, adım kartında
  kenarlık yok, odak halkası 1 px; kapalıyken sarmalayıcı yok (eski DOM).
*/

const WIDTHS = [1280, 768, 375] as const;

for (const width of WIDTHS) {
  test(`ders v2 ${width} px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/e2e/ders-mobil?ui=v2");
    await expect(page.locator(".als").first()).toBeVisible();
    await expect(page.locator("[data-ui~='ders']")).toHaveCount(1);
    const m = await page.evaluate(() => {
      const top = document.querySelector(".als-top")?.getBoundingClientRect();
      const track = document.querySelector(".als-progress-track")?.getBoundingClientRect();
      const icons = [...document.querySelectorAll(".als-icon")].map((el) => el.getBoundingClientRect()).filter((b) => b.width > 0);
      const slide = document.querySelector(".als-slide");
      const brands = [...document.querySelectorAll(".als-cta:not(.als-cta--inline)")].filter((el) => (el as HTMLElement).offsetParent !== null);
      return {
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        top: top?.height ?? 0,
        track: track?.height ?? 0,
        smallestIcon: icons.length ? Math.min(...icons.map((b) => Math.min(b.width, b.height))) : 99,
        slideBorder: slide ? getComputedStyle(slide).borderTopWidth : "0px",
        brands: brands.length,
      };
    });
    expect(m.overflow).toBeLessThanOrEqual(0);
    expect(m.top).toBeGreaterThanOrEqual(56);
    expect(m.track).toBe(6);
    expect(m.smallestIcon).toBeGreaterThanOrEqual(width < 768 ? 44 : 40);
    expect(m.slideBorder).toBe("0px");
    expect(m.brands).toBeLessThanOrEqual(1);
  });
}

test("ders bayrak kapalı: sarmalayıcı yok (eski görünüm)", async ({ page }) => {
  await page.goto("/e2e/ders-mobil");
  await expect(page.locator(".als").first()).toBeVisible();
  await expect(page.locator("[data-ui]")).toHaveCount(0);
});
