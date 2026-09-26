import { test, expect } from "@playwright/test";

/**
 * Learning-loop smoke — auth gerektirmeyen yüzeyler + login yönü.
 * Tam E2E (upload→quiz→notebook) canlı hesap/oturum ister; CI'de smoke ile
 * navigasyon ve marketing tutarlılığı doğrulanır.
 */
test.describe("learning loop surfaces", { tag: ["@smoke"] }, () => {
  test("marketing feature names stay canonical", async ({ page }) => {
    await page.goto("/ozellikler");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // Pazarlama ve uygulama aynı adı kullanıyor: "AI Öğretmen", "Kendi
    // Belgemden Çalış", "Fotoğraftan Çözüm", "Yanlışlar Defteri".
    for (const name of [
      "AI Öğretmen",
      "Kendi Belgemden Çalış",
      "Fotoğraftan Çözüm",
      "Quiz ve Flashcard",
    ]) {
      await expect(page.getByRole("heading", { name })).toBeVisible();
    }
    await expect(page.getByText("Yanlışlar Defteri", { exact: false }).first()).toBeVisible();
  });

  test("ana sayfa özellik şeridi canonical", async ({ page }) => {
    await page.goto("/");
    for (const name of ["Sözlü Sınav", "Deneme Sınavı", "Fotoğraftan Çözüm"]) {
      await expect(page.getByRole("heading", { name, exact: true }).first()).toBeVisible();
    }
  });

  test("girişsiz dashboard girişe yönlenir ve geri döner", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/giris/);
    await expect(page).toHaveURL(/next=%2Fdashboard/);
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
