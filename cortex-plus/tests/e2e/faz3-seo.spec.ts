import { expect, test, type Page } from "@playwright/test";

/**
 * Faz 3 (20 Kasım 2026): kamu sayfalarının tam yüklemede gördüğü kanonik adres, sayfaya özel paylaşım bilgisi ve
 * JSON-LD. Next.js'in metadata birleştirmesi (sayfa `openGraph` verince kökteki görselin düşmesi) birim testinde
 * görünmez; burada çizilen HTML okunur.
 */

async function jsonLdTypes(page: Page): Promise<string[]> {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  return blocks.flatMap((text) => {
    const data = JSON.parse(text) as unknown;
    return (Array.isArray(data) ? data : [data]).map((item) => String((item as { "@type": string })["@type"]));
  });
}

test.describe("Faz 3 SEO", { tag: ["@public"] }, () => {
  for (const path of ["/ozellikler", "/fiyatlandirma", "/sinav-hazirligi", "/yardim", "/ornek", "/mufredat"]) {
    test(`${path}: kanonik, paylaşım adresi ve görseli sayfanın kendisi`, async ({ page }) => {
      await page.goto(path);
      const url = `https://cortexplus.app${path}`;
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", url);
      await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", url);
      await expect(page.locator('meta[property="og:image"]').first()).toHaveAttribute("content", /\/opengraph-image\.png/);
      await expect(page.locator('meta[name="twitter:image"]').first()).toHaveAttribute("content", /\/twitter-image\.png/);
    });
  }

  test("ana sayfa: kanonik kök adres; kurum, site ve SSS yapılandırılmış verisi", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://cortexplus.app");
    expect(await jsonLdTypes(page)).toEqual(expect.arrayContaining(["EducationalOrganization", "WebSite", "FAQPage"]));
  });

  test("yardım SSS'si ve müfredat program sayfasının gezinme yolu", async ({ page }) => {
    await page.goto("/yardim");
    expect(await jsonLdTypes(page)).toContain("FAQPage");
    await page.goto("/mufredat/meb-5-dkab");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://cortexplus.app/mufredat/meb-5-dkab");
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /.+/);
    expect(await jsonLdTypes(page)).toContain("BreadcrumbList");
  });
});
