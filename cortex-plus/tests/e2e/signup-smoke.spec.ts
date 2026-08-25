import { test, expect } from "@playwright/test";

test.describe("Kayıt ve marketing", () => {
  test("ana sayfa ve kayıt sihirbazı rol seçimi", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /ÜCRETSİZ DENE/i }).first()).toBeVisible();

    await page.goto("/kayit");
    await expect(page.getByText("Öğrenciyim")).toBeVisible();
    await expect(page.getByText("Veliyim")).toBeVisible();
    await expect(page.getByText("Okul öğretmeniyim")).toBeVisible();
  });

  test("mobil uygulama marketing sayfası", async ({ page }) => {
    await page.goto("/mobil-uygulama");
    await expect(page.getByRole("heading", { name: "Mobil uygulama" })).toBeVisible();
  });
});
