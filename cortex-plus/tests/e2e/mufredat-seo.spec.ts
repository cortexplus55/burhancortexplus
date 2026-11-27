import { expect, test } from "@playwright/test";

/** Paket 6: ünite ve kazanım SEO sayfaları, konu ağacı etiketi, site haritası. */
test.describe("Müfredat SEO", { tag: ["@public"] }, () => {
  test("MEB ünite → kazanım; resmî programda ağaç etiketi yok", async ({ page }) => {
    await page.goto("/mufredat/meb-5-dkab/1");
    await expect(page.getByTestId("tree-label")).toHaveCount(0);
    const first = page.getByTestId("unit-outcomes").getByRole("link").first();
    await first.click();
    // 6 Kasım 2026: kazanım sayfası artık havuzdan okuyor (ilk ISR çizimi daha uzun); geçişe süre tanınır.
    await expect(page).toHaveURL(/\/mufredat\/meb-5-dkab\/1\/1$/, { timeout: 20_000 });
    await expect(page.getByTestId("outcome-text")).toBeVisible();
    // İstemci geçişinde Next akışlı metadata eski canonical'ı kısa süre body'de tutabilir;
    // tarayıcı/arama motorunun gördüğü tam yüklemeyi doğrula.
    await page.goto("/mufredat/meb-5-dkab/1/1");
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://cortexplus.app/mufredat/meb-5-dkab/1/1");
  });

  test("TUS sayfaları 'resmî ÖSYM listesi değildir' der", async ({ page }) => {
    for (const path of ["/mufredat/tus-2026-tree-anatomi", "/mufredat/tus-2026-tree-anatomi/1", "/mufredat/tus-2026-tree-anatomi/1/1"]) {
      await page.goto(path);
      await expect(page.getByTestId("tree-label")).toContainText("resmî ÖSYM listesi değildir");
    }
  });

  test("bilinmeyen ünite 404; site haritası kazanımları içerir, derin eşi olan eski ağacı içermez", async ({ page, request }) => {
    const res = await page.goto("/mufredat/meb-5-dkab/999");
    expect(res?.status()).toBe(404);
    const xml = await (await request.get("/sitemap.xml")).text();
    expect(xml).toContain("/mufredat/meb-5-dkab/1/1</loc>");
    expect(xml).toContain("/mufredat/tus-2026-deep-anatomi</loc>");
    expect(xml).toContain("/mufredat/kpss-2026-tree-guncel</loc>");
    expect(xml).not.toContain("/mufredat/tus-2026-tree-anatomi");
  });

  // 27 Kasım 2026: derin eşi olan eski konu ağacı açık kalır ama arama motoruna önerilmez ve güncel hâline bağlanır.
  test("eski TUS ağacı: 200, noindex follow, güncel hâline bağlantı; derin eşi dizinde", async ({ request }) => {
    for (const path of ["/mufredat/tus-2026-tree-anatomi", "/mufredat/tus-2026-tree-anatomi/1", "/mufredat/tus-2026-tree-anatomi/1/1"]) {
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
      const html = await response.text();
      expect(html, path).toMatch(/<meta name="robots" content="noindex, follow"/);
      expect(html, path).toContain('data-testid="superseded-notice"');
      expect(html, path).toContain('href="/mufredat/tus-2026-deep-anatomi"');
      expect(html, path).toContain(`<link rel="canonical" href="https://cortexplus.app${path}"/>`);
    }
    const deep = await (await request.get("/mufredat/tus-2026-deep-anatomi")).text();
    expect(deep).not.toMatch(/<meta name="robots" content="noindex/);
    expect(deep).not.toContain('data-testid="superseded-notice"');
    const guncel = await (await request.get("/mufredat/kpss-2026-tree-guncel")).text();
    expect(guncel).not.toMatch(/<meta name="robots" content="noindex/);
  });

  test("liste sayfası eski ağacı göstermez; derin sürümü ve güncel bilgiler ağacı listede", async ({ request }) => {
    const html = await (await request.get("/mufredat")).text();
    expect(html).not.toContain('href="/mufredat/tus-2026-tree-anatomi"');
    expect(html).not.toContain('href="/mufredat/kpss-2026-tree-turkce"');
    expect(html).toContain('href="/mufredat/tus-2026-deep-anatomi"');
    expect(html).toContain('href="/mufredat/kpss-2026-tree-guncel"');
  });
});

test("kazanım sayfasında konu ağacı etiketi bir kez görünür", { tag: ["@public"] }, async ({ page }) => {
  await page.goto("/mufredat/tus-2026-tree-anatomi/1/2");
  await expect(page.getByText("resmî ÖSYM listesi değildir")).toHaveCount(1);
});
