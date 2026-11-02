import { expect, test } from "@playwright/test";

for (const width of [320, 375, 412]) {
  test(`@public ilerleme kartları ${width}px: taşma yok, varsayıma dayalı tasarruf yok`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/e2e/ilerleme");
    await expect(page.getByText("Tüm zamanlar", { exact: true })).toBeVisible();
    await expect(page.getByText(/tasarruf/i)).toHaveCount(0);
    await expect(page.getByText(/₺/)).toHaveCount(0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const year = page.locator(".cp-activity-year");
    const box = await year.boundingBox();
    expect(box && box.x + box.width).toBeLessThanOrEqual(width);
  });
}
