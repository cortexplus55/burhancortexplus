import { expect, test } from "@playwright/test";

const FORBIDDEN =
  /\[(?:omurga|öğretim|kapsam)[^\]]*\]|kaynak doğrulama|düzeltme turu|öğretim ölçütü/;

test.describe("öğrenci ders ekranı", { tag: ["@public"] }, () => {
  test("iç etiket ve denetim cümlesi görünmez", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBeLessThan(400);
    // 11 Kasım 2026: ana sayfadaki ders ekranı artık tanıtım turunun 3. adımı.
    await expect(async () => {
      await page.getByRole("button", { name: /^Adım 3: / }).click();
      await expect(page.locator("section.lj .lj-formula")).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 20_000 });
    const figureText = await page.locator("section.lj .lj-stage").innerText();
    const pageText = await page.locator("body").innerText();
    expect(figureText).not.toMatch(FORBIDDEN);
    expect(pageText).not.toMatch(FORBIDDEN);
    expect(figureText.length).toBeGreaterThan(20);
  });
});
