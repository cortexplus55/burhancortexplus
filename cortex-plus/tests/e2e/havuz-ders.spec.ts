import { expect, test } from "@playwright/test";

/*
  Canlı ölçüm (3 Kasım 2026): belgesiz hazırlıkta ilk ders düğümü havuz metnini gösterip "Önerilen ders /
  Ders oluştur" kurulum kartına dönüyordu. Doğrudan açılışta kart hiç çizilmez; ilk metin hemen görünür.
*/
for (const width of [375, 1280]) {
  test(`belgesiz ilk ders havuz dersini doğrudan açar (${width} px) @public`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/e2e/havuz-ders");
    const lesson = page.getByTestId("instant-lesson");
    await expect(lesson).toBeVisible();
    await expect(lesson).toContainText("Hücre, canlıların yapı ve işlev birimidir.");
    await page.waitForTimeout(800);
    await expect(page.getByText(/Önerilen ders/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Ders oluştur/i })).toHaveCount(0);
    await expect(lesson).toContainText("Hücre, canlıların yapı ve işlev birimidir.");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test("belgeli hazırlıkta kurulum kartı kalır @public", async ({ page }) => {
  await page.goto("/e2e/havuz-ders?auto=0");
  await expect(page.getByTestId("instant-lesson")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Ders oluştur|Oluştur|Başla/i }).first()).toBeVisible();
});
