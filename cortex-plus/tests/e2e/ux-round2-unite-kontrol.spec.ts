import { expect, test } from "@playwright/test";

/** UX tur 2, bulgu 10: Ünite Seviye Kontrolü mobilde (320/375/412) 4 soru → sonuç; taşma yok. */
for (const width of [320, 375, 412]) {
  test(`Ünite Seviye Kontrolü @ ${width}px`, { tag: ["@public"] }, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/e2e/unite-kontrol");
    const box = page.getByTestId("unit-check");
    await expect(box).toContainText("Ünite Seviye Kontrolü · 3–4 soru");
    await page.getByRole("button", { name: "Kontrolü başlat" }).click();
    for (let i = 0; i < 4; i++) {
      await expect(page.getByTestId("level-runner")).toContainText(`${i + 1} / 4`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      await page.getByTestId("level-runner").getByRole("button", { name: /Doğru şık/ }).click();
      await page.getByTestId("level-feedback").getByRole("button").click();
    }
    await expect(page.getByTestId("unit-check-result").locator("li")).toHaveCount(3);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `/workspace/ux-audit/round2-fix/b10_unite_kontrol_${width}.png`, fullPage: true });
  });
}
