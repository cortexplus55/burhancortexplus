import { expect, test } from "@playwright/test";

/** Paket 6: ünite ve kazanım SEO sayfaları, konu ağacı etiketi, site haritası. */
test.describe("Müfredat SEO", { tag: ["@public"] }, () => {
  test("MEB ünite → kazanım; resmî programda ağaç etiketi yok", async ({ page }) => {
    await page.goto("/mufredat/meb-5-dkab/1");
    await expect(page.getByTestId("tree-label")).toHaveCount(0);
    const first = page.getByTestId("unit-outcomes").getByRole("link").first();
    await first.click();
    await expect(page).toHaveURL(/\/mufredat\/meb-5-dkab\/1\/1$/);
    await expect(page.getByTestId("outcome-text")).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://cortexplus.app/mufredat/meb-5-dkab/1/1");
  });

  test("TUS sayfaları 'resmî ÖSYM listesi değildir' der", async ({ page }) => {
    for (const path of ["/mufredat/tus-2026-tree-anatomi", "/mufredat/tus-2026-tree-anatomi/1", "/mufredat/tus-2026-tree-anatomi/1/1"]) {
      await page.goto(path);
      await expect(page.getByTestId("tree-label")).toContainText("resmî ÖSYM listesi değildir");
    }
  });

  test("bilinmeyen ünite 404; site haritası kazanımları içerir", async ({ page, request }) => {
    const res = await page.goto("/mufredat/meb-5-dkab/999");
    expect(res?.status()).toBe(404);
    const xml = await (await request.get("/sitemap.xml")).text();
    expect(xml).toContain("/mufredat/meb-5-dkab/1/1</loc>");
    expect(xml).toContain("/mufredat/tus-2026-tree-anatomi</loc>");
  });
});

test("kazanım sayfasında konu ağacı etiketi bir kez görünür", { tag: ["@public"] }, async ({ page }) => {
  await page.goto("/mufredat/tus-2026-tree-anatomi/1/2");
  await expect(page.getByText("resmî ÖSYM listesi değildir")).toHaveCount(1);
});
