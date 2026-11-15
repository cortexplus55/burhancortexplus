import { expect, test, type Page } from "@playwright/test";

/**
 * Sınav sabahı kâğıdı paketi (15 Kasım 2026): süzgeç çipleri, formül özeti, hoca uyarıları, koyu / A4 görünüm,
 * paylaşım düğmeleri ve QR'lı imza. Gerçek bileşen + gerçek derleyici, veritabanısız fikstür (`/e2e/sinav-sabahi`).
 */

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const width of [375, 360, 1280]) {
  test(`kâğıt ${width} px: süzgeç, A4 önizlemesi, paylaşım; taşma yok`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/e2e/sinav-sabahi");
    const sheet = page.locator("article.cp-cram-sheet");
    await expect(sheet.locator("#cram-title")).toBeVisible();
    await expect(sheet.getByRole("region", { name: "Formül özeti" })).toBeVisible();
    await expect(sheet.getByRole("region", { name: "Hoca uyarıları" })).toContainText("10 olarak alınacaktır");
    await noHorizontalOverflow(page);

    // Dokunma alanı: süzgeç ve paylaşım düğmeleri en az 40 px.
    for (const name of ["Tümü", "Formüller", "Sınav Tuzakları", "Yanıldığım Noktalar"]) {
      const box = await sheet.getByRole("button", { name: new RegExp(name) }).boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(40);
    }
    expect((await sheet.getByRole("link", { name: /WhatsApp'ta Paylaş/ }).boundingBox())!.height).toBeGreaterThanOrEqual(44);

    await sheet.getByRole("button", { name: /Yanıldığım Noktalar/ }).click();
    await expect(sheet.getByRole("region", { name: "En çok yanıldığın noktalar" })).toBeVisible();
    await expect(sheet.getByRole("region", { name: "Formül özeti" })).toHaveCount(0);

    await sheet.getByRole("button", { name: /Tümü/ }).click();
    await sheet.getByRole("button", { name: /A4 Kağıt Önizlemesi/ }).click();
    await expect(sheet).toHaveAttribute("data-view", "paper");
    const paper = await sheet.locator(".cp-cram-page").evaluate((node) => getComputedStyle(node).backgroundColor);
    expect(paper).toBe("rgb(255, 255, 255)");
    await expect(sheet.locator(".cp-cram-sign")).toContainText("Cortex Plus · cortexplus.app");
    await expect(sheet.locator(".cp-cram-qr")).toBeVisible();
    await noHorizontalOverflow(page);
  });
}

test("baskıda süzgeç ve düğmeler gizli, imza basılır", async ({ page }) => {
  await page.goto("/e2e/sinav-sabahi");
  const sheet = page.locator("article.cp-cram-sheet");
  await expect(sheet.locator("#cram-title")).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(sheet.locator(".cp-cram-toolbar")).toBeHidden();
  await expect(sheet.locator(".cp-cram-actions")).toBeHidden();
  await expect(sheet.locator(".cp-cram-sign")).toBeVisible();
});
