import { test, expect } from "@playwright/test";

/*
  Yönetim paneli (6 Kasım 2026): oturumsuz ziyaretçi /admin ve alt sayfaları için 404 alır; girişe
  yönlenmez, panelin varlığı söylenmez. Öğrenci için aynı koruma birim testinde (yonetim-temeli.test.ts).
*/
test.describe("yönetim paneli koruması", { tag: ["@public", "@smoke"] }, () => {
  for (const route of ["/admin", "/admin/yoneticiler", "/admin/kapi", "/admin/paketler"]) {
    test(`${route} misafire 404`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status()).toBe(404);
      await expect(page).not.toHaveURL(/\/giris/);
      await expect(page.getByText("Yönetim Paneli")).toHaveCount(0);
    });
  }
});
