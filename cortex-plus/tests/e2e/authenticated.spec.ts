import { test, expect } from "@playwright/test";

/**
 * Oturumlu smoke — `auth.setup.ts` + storageState.
 * Kimlik bilgisi yoksa setup boş state yazar; bu suite de atlanır.
 */
const hasAuthCreds = Boolean(
  process.env.E2E_USER_EMAIL?.trim() && process.env.E2E_USER_PASSWORD,
);
const hasRealSupabase =
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) &&
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY !== "sb-e2e-local-only";

test.describe("authenticated student hub", { tag: ["@auth"] }, () => {
  test.beforeEach(() => {
    test.skip(
      !hasAuthCreds || !hasRealSupabase,
      "E2E_USER_* veya gerçek Supabase anahtarı yok",
    );
  });

  test("kaydedilmiş oturumla /ogretmen paneli ve chrome yüklenir", async ({
    page,
  }) => {
    await page.goto("/ogretmen");

    await expect(page).toHaveURL(/\/ogretmen/);
    await expect(page).not.toHaveURL(/\/giris/);

    const header = page.locator("header.cp-sor-top");
    await expect(header).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Cortex Plus Ana Sayfa" }),
    ).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Ana bölümler" })).toBeVisible();

    // Üst nav'da metin linki + avatar; ikisi de /profil — avatar erişilebilir adı sabit.
    await expect(page.locator("a.cp-sor-avatar")).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Ana bölümler" }).getByRole("link", {
        name: "Profil",
      }),
    ).toBeVisible();

    // Ücretsiz: Satın al; kurucu: Kurucu etiketi; abone: çip yok (Astra gibi),
    // üst çubukta seri duruyor. Kredi sayısı hiçbir kademede yazılmıyor.
    const chromeCredit = page
      .getByRole("link", { name: /Satın al/ })
      .or(page.getByRole("link", { name: /Kurucu/ }))
      .or(page.locator("button.cp-sor-streak"));
    await expect(chromeCredit.first()).toBeVisible();
    await expect(page.locator("a.cp-sor-credit-chip")).toHaveCount(0);
  });

  /*
    Telefon denetimi (18 Ekim 2026): giriş yapılmış ekranlar otomatik testte hiç telefon
    genişliğinde açılmıyordu; "Geri"li üst çubuk 456 px'e taşıyor, Belgelerim 418 px'e
    açılıyordu ve kimse görmedi. Burada hem sayfa hem üst çubuk 390 px'e sığmalı —
    üst çubuğu ayrıca ölçüyoruz, çünkü sohbet sayfasında kök kutu taşanı kırpıyor ve
    sayfa genişliği tek başına temiz görünüyor.
  */
  test("telefon genişliğinde oturumlu ekranlar ve üst çubuk yana taşmaz", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    /*
      Belgelerim sunucuda servis anahtarıyla çalışıyor (özellik bayrağı + öğretmen analizi).
      CI'ya servis anahtarı verilmiyor; o yüzden anahtar yoksa bu sayfa atlanır, yerelde
      (.env.local) ölçülür. Hata sayfası yana taşmadığı için genişlik tek başına yetmez:
      durum kodu ve üst çubuğun varlığı da aranır — 500 dönen sayfa sessizce geçmesin.
    */
    const needsServiceKey = new Set(["/dokumanlar"]);
    const screens = [
      "/ogretmen",
      "/deneme-sinavlari",
      "/deneme-sinavlari/ara",
      "/deneme-sinavlari/hazirliklarim",
      "/dokumanlar",
      "/profil",
    ].filter((path) => process.env.SUPABASE_SECRET_KEY || !needsServiceKey.has(path));
    for (const path of screens) {
      const response = await page.goto(path);
      expect(response?.status() ?? 0, `${path} durum kodu`).toBeLessThan(400);
      await page.waitForLoadState("domcontentloaded");
      const fit = await page.evaluate(() => {
        const root = document.documentElement;
        const header = document.querySelector("header.cp-sor-top");
        return {
          page: root.scrollWidth - root.clientWidth,
          hasHeader: Boolean(header),
          header: header ? header.scrollWidth - header.clientWidth : 0,
        };
      });
      expect(fit.hasHeader, `${path} üst çubuk yok`).toBe(true);
      expect(fit.page, `${path} sayfa genişliği`).toBeLessThanOrEqual(1);
      expect(fit.header, `${path} üst çubuk`).toBeLessThanOrEqual(1);
    }
  });
});
