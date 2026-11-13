import { test, expect } from "@playwright/test";

/*
  Yönetim paneli (6 Kasım 2026): oturumsuz ziyaretçi /admin ve alt sayfaları için 404 alır; girişe
  yönlenmez, panelin varlığı söylenmez. Öğrenci için aynı koruma birim testinde (yonetim-temeli.test.ts).
*/
test.describe("yönetim paneli koruması", { tag: ["@public", "@smoke"] }, () => {
  /*
    Misafir isteği ara katmanda 404 almaz; yönetim düzeni derlenip `requireAdminPage()` 404 verir (panelin varlığı
    söylenmesin diye bilerek). Geliştirme sunucusu her /admin rotasını ilk açılışta derler: CI'da dört rota dört
    işçide aynı anda derlenince 80 sn'yi aştı (13 Kasım 2026, iki kez). Rotalar aynı işçide sırayla açılır; ilki
    ortak düzeni derler, sonrakiler yalnız kendi sayfasını.
  */
  test.describe.configure({ mode: "serial", timeout: 150_000 });
  for (const route of ["/admin", "/admin/yoneticiler", "/admin/kapi", "/admin/paketler"]) {
    test(`${route} misafire 404`, async ({ page }) => {
      const response = await page.goto(route, { timeout: 140_000 });
      expect(response?.status()).toBe(404);
      await expect(page).not.toHaveURL(/\/giris/);
      await expect(page.getByText("Yönetim Paneli")).toHaveCount(0);
    });
  }
});
