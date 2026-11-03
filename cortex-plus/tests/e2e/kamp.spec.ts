import { expect, test } from "@playwright/test";

test.describe("Kamp modu", { tag: ["@public"] }, () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("≤7 gün: mevcut Plus Haftalık'a sakin yönlendirme, Plus'ta gizli", async ({ page }) => {
    await page.goto("/e2e/kamp");
    const card = page.getByTestId("camp-card");
    await expect(card).toContainText("Sınavına 5 gün kaldı");
    await expect(card).toContainText("Plus Haftalık (₺349 / 7 gün)");
    await expect(page.getByTestId("camp-link")).toHaveAttribute("href", "/pay");
    await expect(page.getByTestId("plus-camp")).toHaveText("yok");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
