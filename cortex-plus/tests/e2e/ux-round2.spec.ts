import { expect, test } from "@playwright/test";

/** UX denetimi tur 2 (2 Kasım 2026): mobil genişliklerde (320/375/412), veritabanısız fikstürler. */
const WIDTHS = [320, 375, 412];

test.describe("UX tur 2", { tag: ["@public"] }, () => {
  for (const width of WIDTHS) {
    test(`kilitli test sorusu yenilemede açıklamalı ve değiştirilemez (${width}px)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/e2e/quiz-kilit");
      await page.getByText("Birinci", { exact: true }).click();
      await page.getByRole("button", { name: /Kontrol et/ }).click();
      await expect(page.getByText("Doğru cevap ikinci seçenek.")).toBeVisible();
      await page.reload();
      await expect(page.getByText("Doğru cevap ikinci seçenek.")).toBeVisible();
      await expect(page.getByRole("radio", { name: /İkinci/ }).or(page.getByRole("button", { name: /İkinci/ })).first()).toBeDisabled();
      await expect(page.getByRole("button", { name: /Kontrol et/ })).toHaveCount(0);
      const stored = await page.evaluate(() => JSON.parse(sessionStorage.getItem("e2e:quiz-kilit") ?? "{}"));
      expect(stored["0"]).toBe("Birinci");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
