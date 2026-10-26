import { expect, test } from "@playwright/test";

const FORBIDDEN = [
  "Bu bölüm bu sefer yetişmedi",
  "Ders bu sefer tamamlanamadı",
  "Bağlantı kurulamadı",
  "elde soru yok",
  "Planlanan",
];

test.describe("deneme delivery fixture", { tag: ["@public"] }, () => {
  test("walks all 20 promised questions", async ({ page }) => {
    const response = await page.goto("/e2e/deneme");
    expect(response?.status()).toBeLessThan(400);
    const counter = page.getByRole("button", { name: "Soru haritasını aç" });
    await expect(counter).toContainText("1 / 20");
    const next = page.getByRole("button", { name: /Sonraki/ });
    for (let step = 0; step < 19; step += 1) await next.click();
    await expect(counter).toContainText("20 / 20");
    await expect(page.getByRole("button", { name: "Sınavı bitir" })).toBeVisible();
    const body = await page.locator("body").innerText();
    for (const phrase of FORBIDDEN) expect(body, phrase).not.toContain(phrase);
  });
});
