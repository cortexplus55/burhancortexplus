import { expect, test } from "@playwright/test";

for (const width of [320, 375, 412]) {
  test(`@public ayarlar e-posta kartı ${width}px: uzun adres yatay kaydırma yapmaz`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/e2e/ayarlar");
    await expect(page.getByText(/ornek-alan-adi/)).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
