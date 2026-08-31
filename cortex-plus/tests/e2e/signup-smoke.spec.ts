import { test, expect } from "@playwright/test";

test.describe("Kayıt ve marketing", () => {
  test("ana sayfa ve kayıt sihirbazı öğrenci adımları", async ({ page }) => {
    await page.goto("/");
    // Keep this pattern lowercase: "İ" (U+0130) case-folds to "i" plus a
    // combining dot, so an uppercase Turkish spelling never matches "Ücretsiz"
    // even with the /i flag.
    await expect(
      page.getByRole("link", { name: /ücretsiz dene/i }).first(),
    ).toBeVisible();

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
