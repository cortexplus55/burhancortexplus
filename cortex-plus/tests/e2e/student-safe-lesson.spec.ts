import { expect, test } from "@playwright/test";

const FORBIDDEN =
  /\[(?:omurga|öğretim|kapsam)[^\]]*\]|kaynak doğrulama|düzeltme turu|öğretim ölçütü/;

test.describe("öğrenci ders ekranı", { tag: ["@public"] }, () => {
  test("iç etiket ve denetim cümlesi görünmez", async ({ page }) => {
    const response = await page.goto("/");
    expect(response?.status()).toBeLessThan(400);
    const figures = page.getByRole("figure", { name: /Ders ekranı örneği/ });
    await expect(figures).toHaveCount(2);
    const figureText = (await figures.allInnerTexts()).join("\n");
    const pageText = await page.locator("body").innerText();
    expect(figureText).not.toMatch(FORBIDDEN);
    expect(pageText).not.toMatch(FORBIDDEN);
    expect(figureText.length).toBeGreaterThan(20);
  });
});
