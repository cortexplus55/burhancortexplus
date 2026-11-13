import { test, expect } from "@playwright/test";

/**
 * Oturumlu smoke — `auth.setup.ts` + storageState.
 * Kimlik bilgisi yoksa setup boş state yazar; bu suite de atlanır.
 */
const hasAuthCreds = Boolean(
  process.env.E2E_USER_EMAIL?.trim() && process.env.E2E_USER_PASSWORD,
);
const isLive = Boolean(process.env.E2E_BASE_URL?.trim());
const hasRealSupabase =
  isLive ||
  (Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY !== "sb-e2e-local-only");

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

    // 13 Kasım 2026 (kabuk): bütün öğrenci sayfalarında ana ekranın üst çubuğu.
    const header = page.locator("header.cx-home-top");
    await expect(header).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Cortex Plus Ana Sayfa" }),
    ).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Ana bölümler" })).toBeVisible();

    // Profil üst çubukta yalnız avatarda (sekme tepsisinde üç sekme: Ana Sayfa, Sınavlar, Çalışma Stüdyosu).
    await expect(page.locator("a.cx-home-avatar")).toBeVisible();
    await expect(page.locator("a.cx-home-avatar")).toHaveAttribute("aria-label", "Profil");

    // Ücretsiz: Satın al; kurucu: Kurucu etiketi; abone: çip yok (kıyas ürünü gibi),
    // üst çubukta seri duruyor. Kredi sayısı hiçbir kademede yazılmıyor.
    const chromeCredit = page
      .getByRole("link", { name: /Satın al/ })
      .or(page.getByRole("link", { name: /Kurucu/ }))
      .or(page.locator("button.cx-home-streak"));
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
      // Canlı duman testinde (8 Kasım 2026) öğrencinin öbür ana sayfaları da: her yayında açılıyor mu.
      ...(isLive
        ? ["/araclar", "/ilerleme", "/ayarlar", "/krediler", "/pay", "/soru-coz", "/yanlislarim", "/siniflar", "/deneme-sinavlari/mufredat", "/tekrar", "/sohbetler", "/destek"]
        : []),
    ].filter((path) => isLive || process.env.SUPABASE_SECRET_KEY || !needsServiceKey.has(path));
    /*
      Süre gezilen sayfa sayısına bağlı (10 Kasım 2026): canlı turda 18 sayfa tek testin varsayılan 30 sn'sine
      sığmıyordu (sayfa başına ~1,7 sn; 17. sayfada "Test timeout of 30000ms exceeded" ve duman testi her yayında
      kırmızıydı, üründe hata yokken). Sayfa başına 10 sn pay; tek sayfa 20 sn'de açılmazsa o sayfanın adıyla düşer.
    */
    test.setTimeout(30_000 + screens.length * 10_000);
    for (const path of screens) {
      const response = await page.goto(path, { waitUntil: "domcontentloaded", timeout: 20_000 });
      expect(response?.status() ?? 0, `${path} durum kodu`).toBeLessThan(400);
      /*
        Üst çubuk süreyle değil olayla beklenir: `/sohbetler`'in yükleme iskeleti var (bilinen üç istisnadan biri),
        içerik iskeletin ardından akar. İskelet ekrandayken bakan test "üst çubuk yok" diyordu. Çubuk 15 sn'de
        gelmezse sayfa gerçekten boş kalmıştır (Suspense hatası) ve test sayfanın adıyla düşer.
      */
      // 13 Kasım 2026 (kabuk): fiyat sayfası tam ekran odak görünümü; üst çubuk yerine tek cam kapat.
      const chromeSelector = path === "/pay" ? "a.cx-shell-close" : "header.cx-home-top";
      await expect(page.locator(chromeSelector).first(), `${path} üst çubuk yok`).toBeAttached({ timeout: 15_000 });
      const fit = await page.evaluate((selector) => {
        const root = document.documentElement;
        const header = document.querySelector(selector);
        return {
          page: root.scrollWidth - root.clientWidth,
          hasHeader: Boolean(header),
          header: header ? header.scrollWidth - header.clientWidth : 0,
        };
      }, chromeSelector);
      expect(fit.hasHeader, `${path} üst çubuk yok`).toBe(true);
      expect(fit.page, `${path} sayfa genişliği`).toBeLessThanOrEqual(1);
      expect(fit.header, `${path} üst çubuk`).toBeLessThanOrEqual(1);
    }
  });
});
