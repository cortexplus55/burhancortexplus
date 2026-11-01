import { expect, test, type Page } from "@playwright/test";

/** Ünite başlıklarında kaynak sıra numarası ("· 1. Tarih") görünmez. */
async function noOrdinal(page: Page, testId: string) {
  await expect(page.getByTestId(testId)).not.toContainText(/· \d+\. /);
}

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe("Seviye kontrolü", { tag: ["@public"] }, () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("Misafir: TYT Tarih 3 soruluk ön izleme → kayıt çağrısı, kayıt yok", async ({ page }) => {
    await page.goto("/e2e/hizli-tarama");
    await expect(page.getByTestId("guest-scan")).toContainText("⚡ Akıllı Hızlı Tarama");
    for (let i = 0; i < 3; i++) {
      await expect(page.getByTestId("level-runner")).toContainText(`${i + 1} / 3`);
      await noOverflow(page);
      await noOrdinal(page, "level-runner");
      await page.getByTestId("level-runner").getByRole("button", { name: new RegExp("Doğru şık") }).click();
      await expect(page.getByTestId("level-feedback")).toBeVisible();
      await noOverflow(page);
      await page.getByTestId("level-feedback").getByRole("button").click();
    }
    const end = page.getByTestId("guest-signup");
    await expect(end).toContainText("kaydedilmedi");
    // Sonuç yalnız sayı değil: her sorunun ünitesi ve doğru/yanlışı.
    await expect(end.getByTestId("guest-results").locator("li")).toHaveCount(3);
    await expect(end.getByRole("link", { name: "Ücretsiz hesap aç" })).toHaveAttribute("href", /\/kayit\?next=/);
    await noOverflow(page);
  });

  test("Oturum açık: ön izleme yok, tam taramaya yönlendirme", async ({ page }) => {
    await page.goto("/e2e/hizli-tarama?oturum=1");
    const box = page.getByTestId("signed-in-scan");
    await expect(box).not.toContainText("3 soru");
    await expect(page.getByTestId("level-runner")).toHaveCount(0);
    await expect(box.getByRole("link", { name: "Tam taramaya başla" })).toHaveAttribute("href", /\/deneme-sinavlari\/resmi\/kurulum/);
  });

  test("Boş havuz: dürüst mesaj", async ({ page }) => {
    await page.goto("/e2e/hizli-tarama?bos=1");
    await expect(page.getByTestId("level-empty")).toContainText("Bu ders için hazır soru henüz yok.");
  });

  test("Ünite Seviye Kontrolü: 4 soru → kazanım başına sonuç; atlanabilir", async ({ page }) => {
    await page.goto("/e2e/unite-kontrol");
    const box = page.getByTestId("unit-check");
    await expect(box).toContainText("3–4 soru");
    await noOrdinal(page, "unit-check");
    await page.getByRole("button", { name: "Kontrolü başlat" }).click();
    for (let i = 0; i < 4; i++) {
      await expect(page.getByTestId("level-runner")).toContainText(`${i + 1} / 4`);
      await noOrdinal(page, "level-runner");
      await page.getByTestId("level-runner").getByRole("button", { name: i % 2 ? /Yanlış şık C/ : /Doğru şık/ }).click();
      await page.getByTestId("level-feedback").getByRole("button").click();
    }
    const result = page.getByTestId("unit-check-result");
    await expect(result.locator("li")).toHaveCount(3);
    await expect(result).toContainText("tahmini");
    await noOverflow(page);
    await page.reload();
    await page.getByRole("button", { name: "Atla" }).click();
    await expect(page.getByTestId("unit-check")).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId("unit-check")).toHaveCount(0);
  });
});
