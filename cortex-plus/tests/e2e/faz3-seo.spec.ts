import { expect, test, type Page } from "@playwright/test";

/**
 * Faz 3 (20 Kasım 2026): kamu sayfalarının tam yüklemede gördüğü kanonik adres, sayfaya özel paylaşım bilgisi ve
 * JSON-LD. Next.js'in metadata birleştirmesi (sayfa `openGraph` verince kökteki görselin düşmesi) birim testinde
 * görünmez; burada çizilen HTML okunur.
 */

/** Sayfadaki düğümlerin türleri. 27 Kasım 2026'dan (GEO) beri tek betik, düğümler `@graph` içinde. */
async function jsonLdTypes(page: Page): Promise<string[]> {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  return blocks.flatMap((text) => {
    const data = JSON.parse(text) as { "@graph"?: unknown[] } | unknown[];
    const nodes = Array.isArray(data) ? data : (data["@graph"] ?? [data]);
    return nodes.map((item) => String((item as { "@type": string })["@type"]));
  });
}

test.describe("Faz 3 SEO", { tag: ["@public"] }, () => {
  // 26 Kasım 2026 (Search Console): hukuki, iletişim, giriş ve kayıt sayfaları da kendi kanonik adresini yazar
  // (önceden kanonik yoktu, paylaşım adresi ana sayfayı gösteriyordu).
  for (const path of [
    "/ozellikler",
    "/fiyatlandirma",
    "/sinav-hazirligi",
    "/yardim",
    "/ornek",
    "/mufredat",
    "/gizlilik",
    "/kvkk",
    "/kullanim-kosullari",
    "/hesap-silme",
    "/iletisim",
    "/hakkimizda",
    "/cerez-politikasi",
    "/mobil-uygulama",
    "/giris",
    "/kayit",
  ]) {
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
    expect(await jsonLdTypes(page)).toEqual(expect.arrayContaining(["Organization", "WebSite", "FAQPage"]));
  });

  test("fiyat ve müfredat dizini: sayfa ve gezinme yolu yapılandırılmış verisi; teklif fiyatları kartlardakiyle aynı", async ({ page }) => {
    await page.goto("/fiyatlandirma");
    expect(await jsonLdTypes(page)).toEqual(expect.arrayContaining(["WebPage", "BreadcrumbList", "SoftwareApplication"]));
    const pricingLd = (await page.locator('script[type="application/ld+json"]').allTextContents()).join("\n");
    // 27 Kasım 2026 (GEO): teklifler veritabanındaki fiyattan; her ücretli teklifin fiyatı sayfada görünür. Puan yok.
    expect(pricingLd).not.toMatch(/aggregateRating|"review"/);
    type Offer = { name: string; price: string; priceSpecification?: { referenceQuantity?: { value: number } } };
    const offersOf = (ld: string) =>
      (JSON.parse(ld) as { "@graph": Array<{ "@type": string; offers?: Offer[] }> })["@graph"].find(
        (node) => node["@type"] === "SoftwareApplication",
      )!.offers!;
    const offers = offersOf(pricingLd);
    expect(offers[0]).toMatchObject({ name: "Ücretsiz", price: "0" });
    // Aylık planların fiyatı kartta her zaman yazılı (haftalık plan yalnız ödeme açıkken düğmede görünür).
    const visible = await page.locator("main").innerText();
    for (const offer of offers.filter((item) => item.priceSpecification?.referenceQuantity?.value === 30)) {
      const whole = Math.round(Number(offer.price)).toLocaleString("tr-TR");
      expect(visible, offer.name).toContain(whole);
    }
    // Ana sayfa aynı teklifleri yazar (iki sayfa iki ayrı okumayla, aynı plan satırlarından).
    await page.goto("/");
    const homeLd = (await page.locator('script[type="application/ld+json"]').allTextContents()).join("\n");
    expect(offersOf(homeLd)).toEqual(offers);
    await page.goto("/fiyatlandirma");
    await page.goto("/mufredat");
    expect(await jsonLdTypes(page)).toEqual(expect.arrayContaining(["CollectionPage", "BreadcrumbList"]));
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
