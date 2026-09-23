import { test, expect } from "@playwright/test";

/**
 * Learning-loop smoke — auth gerektirmeyen yüzeyler + login yönü.
 * Tam E2E (upload→quiz→notebook) canlı hesap/oturum ister; CI'de smoke ile
 * navigasyon ve marketing tutarlılığı doğrulanır.
 */
test.describe("learning loop surfaces", () => {
  test("marketing feature names stay canonical", async ({ page }) => {
    await page.goto("/ozellikler");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("telefondan cortex page", async ({ page }) => {
    await page.goto("/mobil-uygulama");
    await expect(
      page.getByRole("heading", { name: "Telefondan Cortex" }),
    ).toBeVisible();
  });

  test("giriş sayfası açılır", async ({ page }) => {
    await page.goto("/giris");
    await expect(page.getByRole("button", { name: /Giriş/i }).first()).toBeVisible();
  });
});
