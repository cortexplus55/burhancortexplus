import { expect, test } from "@playwright/test";

/*
  Faz 8 (14 Kasım 2026, `ui.v2.studyo`): /araclar fikstüründe Plus'a özel stüdyo kartı ücretsiz hesapta kilitli, basınca
  yükseltme penceresi; Plus hesapta kapısız. Gerçek üretim çağrısı yok (kartlara basılınca sayfa açılmaz ya da yalnız
  stüdyonun kurulum ekranına gidilir).
*/

const WIDTHS = [375, 768, 1280] as const;

for (const width of WIDTHS) {
  test.describe(`faz 8 · ${width}px`, () => {
    test.use({ viewport: { width, height: 860 } });

    test("ücretsiz: podcast kartı kilitli, basınca pencere, sayfa değişmez", { tag: ["@public"] }, async ({ page }) => {
      await page.addInitScript(() => window.localStorage.setItem("cortex-gamification-v1", "1"));
      await page.goto("/e2e/studyo?ui=v2");
      const card = page.locator('[data-studio="podcast"]');
      await expect(card).toHaveAttribute("data-gate", "locked");
      await expect(card).toContainText("PLUS");
      const box = await card.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      const radius = await card.evaluate((node) => getComputedStyle(node).borderTopLeftRadius);
      expect(radius).toBe("24px");
      await card.click();
      await expect(page.getByRole("dialog")).toBeVisible();
      expect(new URL(page.url()).pathname).toBe("/e2e/studyo");
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toBeHidden();
      await expect(card).toBeFocused();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });

    test("Plus: kart kilitsiz, bağlantı aynen", { tag: ["@public"] }, async ({ page }) => {
      await page.addInitScript(() => window.localStorage.setItem("cortex-gamification-v1", "1"));
      await page.goto("/e2e/studyo?ui=v2&plan=plus");
      const card = page.locator('[data-studio="podcast"]');
      await expect(card).not.toHaveAttribute("data-gate", "locked");
      await expect(card).toHaveAttribute("href", "/studio/podcast");
      await expect(card).not.toContainText("PLUS");
    });

    test("bayrak kapalı: bugünkü Plus rozeti, kapı yok", { tag: ["@public"] }, async ({ page }) => {
      await page.addInitScript(() => window.localStorage.setItem("cortex-gamification-v1", "1"));
      await page.goto("/e2e/studyo");
      const card = page.locator('[data-studio="podcast"]');
      await expect(card).not.toHaveAttribute("data-gate", /.+/);
      await expect(card.locator(".sg-plus")).toContainText("Plus");
    });
  });
}
