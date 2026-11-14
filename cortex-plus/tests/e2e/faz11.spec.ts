import { expect, test } from "@playwright/test";

/*
  Faz 11C (14 Kasım 2026, `ui.v2.buyume`): ana ekran davet şeridi fikstürde (`/e2e/ana-ekran?hazirlik=1&buyume=1`).
  Masaüstünde görünür, telefonda gizli (ana ekran kaydırmasız); kapatılınca yeniden açılışta çıkmaz; günde bir öneri.
*/

test.describe("faz 11 · büyüme", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem("cortex-gamification-v1", "1"));
  });

  test("1280 px: şerit görünür, tek eylem, kapat 40 px; kapatınca yeniden açılışta yok", { tag: ["@public"] }, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/e2e/ana-ekran?hazirlik=1&buyume=1");
    const strip = page.getByRole("region", { name: "Arkadaşını getir" });
    await expect(strip).toBeVisible();
    await expect(strip).toContainText("İkinize de 3 ders hediye");
    await expect(strip.getByRole("button")).toHaveCount(2);
    const close = strip.getByRole("button", { name: "Öneriyi kapat" });
    const box = await close.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(40);
    await close.click();
    await expect(strip).toHaveCount(0);
    await page.reload();
    await expect(page.locator(".cx-cockpit")).toBeVisible();
    await expect(page.getByRole("region", { name: "Arkadaşını getir" })).toHaveCount(0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("375 px: şerit çizilmez (ana ekran kaydırmasız)", { tag: ["@public"] }, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/e2e/ana-ekran?hazirlik=1&buyume=1");
    await expect(page.locator(".cx-cockpit")).toBeVisible();
    await expect(page.getByRole("region", { name: "Arkadaşını getir" })).toBeHidden();
  });

  test("bayrak kapalı: şerit yok", { tag: ["@public"] }, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/e2e/ana-ekran?hazirlik=1");
    await expect(page.locator(".cx-cockpit")).toBeVisible();
    await expect(page.locator(".cx-growth")).toHaveCount(0);
  });
});
