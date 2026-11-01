import { expect, test } from "@playwright/test";

/**
 * 2 Kasım 2026 (mobil UX denetimi): herkese açık sayfalardaki iç bağlantılardan biri 404 veriyordu (/sss), ikisi
 * misafiri "Tekrar hoş geldin" diyen giriş ekranına atıyordu (/destek, /araclar/birim-cember). Kural: herkese açık
 * sayfadaki her iç bağlantı açılır ve misafiri giriş ekranına düşürmez. Kayda (/kayit) inmek serbest: kayıt yeni
 * öğrencinin kapısı.
 */
const PUBLIC_PAGES = [
  "/",
  "/ozellikler",
  "/ornek",
  "/fiyatlandirma",
  "/sinav-hazirligi",
  "/hizli-tarama",
  "/yardim",
  "/hakkimizda",
  "/iletisim",
  "/kvkk",
  "/gizlilik",
  "/kullanim-kosullari",
  "/giris",
  "/kayit",
];

test.describe("public internal links", { tag: ["@public"] }, () => {
  test.setTimeout(300_000);

  test("every internal link on public pages opens without 404 or a login wall", async ({ page, request }) => {
    const links = new Map<string, string>();
    for (const route of PUBLIC_PAGES) {
      await page.goto(route);
      const hrefs = await page.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href") ?? ""));
      for (const href of hrefs) {
        if (!href.startsWith("/") || href.startsWith("//")) continue;
        const clean = href.split("#")[0]!;
        if (!clean || /\.(pdf|png|jpg|svg|webp)$/.test(clean.split("?")[0]!)) continue;
        if (!links.has(clean)) links.set(clean, route);
      }
    }
    expect(links.size).toBeGreaterThan(10);
    const problems: string[] = [];
    for (const [href, from] of links) {
      const res = await request.get(href);
      const finalPath = new URL(res.url()).pathname;
      if (res.status() === 404) problems.push(`${from} → ${href}: 404`);
      else if (finalPath === "/giris" && !href.startsWith("/giris")) problems.push(`${from} → ${href}: giriş ekranı`);
    }
    expect(problems).toEqual([]);
  });

  test("/sss opens the help page", async ({ page }) => {
    await page.goto("/sss");
    await expect(page).toHaveURL(/\/yardim$/);
  });

  test("guest exam setup links land on signup with a return path", async ({ page }) => {
    for (const exam of ["yks", "kpss", "tus", "lgs"]) {
      await page.goto(`/deneme-sinavlari/resmi/kurulum?sinav=${exam}`);
      await expect(page).toHaveURL(new RegExp(`/kayit\\?next=.*kurulum.*sinav%3D${exam}`));
    }
  });
});

for (const width of [360, 375, 412]) {
  test.describe(`signup a11y @${width}px`, { tag: ["@public"] }, () => {
    test.use({ viewport: { width, height: 800 } });
    test("consent checkbox is visible, labelled and tappable; name has a hint", async ({ page }) => {
      await page.goto("/kayit");
      // Seviye: ilk sınıf + ilk hedef; anlatım: ilk stil.
      await page.locator(".signup-wizard .grid-cols-3 button").first().click();
      await page.locator(".signup-wizard .grid-cols-2 .signup-choice").first().click();
      await page.getByRole("button", { name: "Devam" }).click();
      await page.locator(".signup-choice").first().click();
      await page.getByRole("button", { name: "Devam" }).click();
      // E-posta formu bir düğmenin arkasında olabilir.
      const emailToggle = page.getByRole("button", { name: /e-posta/i });
      if (await emailToggle.count()) await emailToggle.first().click();
      const box = page.getByRole("checkbox", { name: /KVKK/ });
      await expect(box).toBeVisible();
      const size = await box.boundingBox();
      expect(size?.width ?? 0).toBeGreaterThanOrEqual(20);
      await expect(page.getByLabel("Ad soyad")).toHaveAttribute("placeholder", /Ad/);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  });
}
