import { test, expect } from "@playwright/test";

test.describe("Kayıt ve marketing", () => {
  test("ana sayfa ve kayıt sihirbazı öğrenci adımları", async ({ page }) => {
    await page.goto("/");
    // Regex'te büyük "İ" kullanmayın: JS'te "İ".toLowerCase() düz "i" değil,
    // "i" + birleşen nokta (U+0307) üretir; /İ/i bu yüzden "i" ile eşleşmez ve
    // sayfada duran "Ücretsiz dene" linkini bulamaz.
    await expect(page.getByRole("link", { name: "Ücretsiz dene" }).first()).toBeVisible();

    await page.goto("/kayit");
    await expect(
      page.getByRole("heading", { name: "Hangi sınıftasın?" }),
    ).toBeVisible();
  });

  test("mobil uygulama marketing sayfası", async ({ page }) => {
    await page.goto("/mobil-uygulama");
    await expect(page.getByRole("heading", { name: "Mobil uygulama" })).toBeVisible();
  });
});
