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
    // 19 Ekim 2026: sayfa bugünkü araçları adlarıyla sayar (Plus etiketliler başlıkta "Plus" taşır).
    for (const name of ["AI öğretmen", "Fotoğraftan çözüm", "Konu testi", "Yanlışlar defteri", "Yazılı deneme"]) {
      await expect(page.getByRole("heading", { name }).first()).toBeVisible();
    }
  });

  test("ana sayfa özellik listesi canonical", async ({ page }) => {
    await page.goto("/");
    // 11 Kasım 2026: özellik ızgarası kalktı; adlar ücretsiz / Plus karşılaştırmasında geçer.
    const plans = page.locator("#planlar");
    for (const name of [/podcast/i, /yazılı deneme/i, /sözlü deneme/i, /konu testi/i]) {
      await expect(plans).toContainText(name);
    }
  });

  // 6 Kasım 2026 (Paket 3): `/dashboard` `next.config.ts`'te `/ogretmen`'e yönlenir; `next` gerçek hedefi taşır.
  test("girişsiz dashboard girişe yönlenir ve geri döner", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/giris/);
    await expect(page).toHaveURL(/next=%2Fogretmen/);
  });

  test("telefondan cortex page", async ({ page }) => {
    await page.goto("/mobil-uygulama");
    await expect(
      page.getByRole("heading", { name: "Telefonuna Uygulama Olarak Kur" }),
    ).toBeVisible();
  });

  test("giriş sayfası açılır", async ({ page }) => {
    await page.goto("/giris");
    await expect(page.getByRole("button", { name: /Giriş/i }).first()).toBeVisible();
  });
});
