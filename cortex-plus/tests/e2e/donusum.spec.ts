import { expect, test, type Page } from "@playwright/test";

/*
  Dönüşüm paketi (7 Kasım 2026): hedef kitle sekmeleri, 7 adımlı tanıtım turu (11 Kasım 2026), kayıt ön seçimi ve ilk adım
  başlatıcısı telefonda (375×812 ve 360×800) yana taşmaz, dokunma alanları 36 px'ten (turda 44 px'ten) küçük değil; tur
  hiçbir ağ isteği atmadan uçtan uca oynanır.
*/

async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function smallestTouchTarget(page: Page, scope: string): Promise<number> {
  return page.evaluate((selector) => {
    const nodes = Array.from(document.querySelectorAll(`${selector} button, ${selector} a`)) as HTMLElement[];
    const heights = nodes.filter((node) => node.offsetParent !== null).map((node) => node.getBoundingClientRect().height);
    return heights.length ? Math.min(...heights) : 99;
  }, scope);
}

const PHONES = [
  { width: 375, height: 812 },
  { width: 360, height: 800 },
] as const;

test.describe("dönüşüm paketi", { tag: ["@public"] }, () => {
  // 11 Kasım 2026: kayıtsız vitrin 7 adımlı tanıtım turuna dönüştü. Tur telefonda baştan sona oynanır:
  // her adımda yana taşma yok, turdaki her düğme en az 44 px, hiçbir ağ isteği atılmaz.
  for (const phone of PHONES) {
    test(`ana sayfa turu ${phone.width}px: yedi adım, taşma yok, dokunma alanı 44 px, ağ isteği yok`, async ({ page }) => {
      const apiCalls: string[] = [];
      page.on("request", (request) => {
        if (/\/api\//.test(request.url()) && !/\/api\/(health|consent)/.test(request.url())) apiCalls.push(request.url());
      });
      await page.setViewportSize(phone);
      await page.goto("/?hedef=universite");
      await expect(page.getByRole("tab")).toHaveCount(4);
      await expect(page.getByRole("tab", { name: /Üniversite/ })).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("link", { name: /Vize-final kampını ücretsiz başlat/ })).toHaveAttribute("href", "/kayit?hedef=universite");
      // Üst menüdeki kayıt düğmesi telefonda da görünür.
      await expect(page.locator("header.mkh").getByRole("link", { name: "Ücretsiz dene" })).toBeVisible();

      const tour = page.locator("section.lj");
      const check = async (step: string) => {
        expect(await overflow(page), `${step}: yana taşma`).toBeLessThanOrEqual(1);
        expect(await smallestTouchTarget(page, "section.lj"), `${step}: dokunma alanı`).toBeGreaterThanOrEqual(44);
      };

      // 1. Not: tarama alanına dokun, tarama bitince yol haritası açılır. Geliştirme sunucusunda ilk dokunuş
      // hidrasyondan önce düşebilir: yol haritası görünene kadar yeniden dene.
      await check("not");
      await expect(async () => {
        const zone = tour.locator("button.lj-zone");
        if (await zone.isEnabled().catch(() => false)) await zone.click();
        await expect(tour.getByRole("button", { name: "1. dersi başlat" })).toBeVisible({ timeout: 2500 });
      }).toPass({ timeout: 25_000 });
      await check("yol");
      await tour.getByRole("button", { name: "1. dersi başlat" }).click();
      await expect(tour.locator(".lj-formula")).toBeVisible();
      await check("ders");
      // Adım değişince ilerleme çizgisi sabit menünün altında kalmaz.
      await expect
        .poll(() =>
          page.evaluate(
            () =>
              document.querySelector(".lj-rail")!.getBoundingClientRect().top -
              document.querySelector("header.mkh")!.getBoundingClientRect().bottom,
          ),
        )
        .toBeGreaterThanOrEqual(0);
      await tour.getByRole("button", { name: "Kuralı soruda dene", exact: true }).click();
      await tour.getByRole("button", { name: /İki şık arasında kaldım/ }).click();
      await expect(tour.locator(".lj-hint")).toBeVisible();
      await check("soru");
      await tour.getByRole("button", { name: "2", exact: true }).click();
      await expect(tour.locator(".lj-feedback.is-right")).toBeVisible();
      await tour.getByRole("button", { name: "Akıllı kartlara geç" }).click();
      await tour.locator("button.lj-flip").click();
      await expect(tour.locator("button.lj-flip")).toHaveAttribute("aria-pressed", "true");
      await check("kart");
      await tour.locator(".lj-cards .lj-cta").click();
      await tour.getByRole("button", { name: /Doğru$/ }).click();
      await expect(tour.locator(".lj-truth-btn.is-right")).toBeVisible();
      await check("doğru/yanlış");
      await tour.getByRole("button", { name: /Plus'ta başka neler var/ }).click();
      await expect(tour.locator(".lj-plus-badge")).toHaveCount(4);
      await expect(tour.getByRole("link", { name: /İlk dersimi ücretsiz başlat/ })).toHaveAttribute("href", "/kayit?hedef=universite");
      await check("plus");
      expect(apiCalls).toEqual([]);
    });
  }

  test("sekme değişince kahraman, turun kayıt bağlantısı ve adres değişir", async ({ page }) => {
    await page.goto("/");
    await expect(async () => {
      await page.getByRole("tab", { name: /KPSS/ }).click();
      await expect(page.getByRole("link", { name: /Sınav kampını ücretsiz başlat/ })).toHaveAttribute("href", "/kayit?hedef=akademik", { timeout: 1500 });
    }).toPass({ timeout: 20_000 });
    expect(page.url()).toContain("hedef=akademik");
    await page.getByRole("button", { name: /^Adım 7: / }).click();
    await expect(page.getByRole("link", { name: /İlk dersimi ücretsiz başlat/ })).toHaveAttribute("href", "/kayit?hedef=akademik");
  });

  test("üst menü kaydırınca sabit kalır", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => window.scrollTo(0, 1600));
    await expect(page.locator("header.mkh")).toBeInViewport();
    await expect(page.locator("header.mkh").getByRole("link", { name: "Ücretsiz dene" })).toBeVisible();
  });

  test("kayıt: ?hedef=yks-lgs hedefi önceden seçer, 8. sınıf seçilince LGS'ye döner", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/kayit?hedef=yks-lgs");
    await expect(page.getByRole("heading", { name: "Hangi sınıftasın, hedefin ne?" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^YKS hazırlık/ })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "8. sınıf", exact: true }).click();
    await expect(page.getByRole("button", { name: /^LGS hazırlık/ })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "11. sınıf", exact: true }).click();
    await expect(page.getByRole("button", { name: /^YKS hazırlık/ })).toHaveAttribute("aria-pressed", "true");
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  });

  for (const phone of PHONES) {
    test(`ilk adım başlatıcısı ${phone.width}px: üç kapı, çipler, taşma yok`, async ({ page }) => {
      await page.setViewportSize(phone);
      await page.goto("/e2e/ilk-adim?hedef=yks");
      await expect(page.getByRole("heading", { name: /YKS \(TYT-AYT\) hedefin için/ })).toBeVisible();
      await expect(page.getByRole("link", { name: "Fizik" })).toBeVisible();
      await expect(page.getByRole("link", { name: /Çözemediğin sorunun/ })).toHaveAttribute("href", "/soru-coz");
      expect(await overflow(page)).toBeLessThanOrEqual(1);
      expect(await smallestTouchTarget(page, ".cp-first-step")).toBeGreaterThanOrEqual(36);
      await page.getByRole("button", { name: "Şimdilik gizle" }).click();
      await expect(page.getByRole("heading", { name: /hedefin için/ })).toHaveCount(0);
    });
  }
});
