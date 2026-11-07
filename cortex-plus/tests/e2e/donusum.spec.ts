import { expect, test, type Page } from "@playwright/test";

/*
  Dönüşüm paketi (7 Kasım 2026): hedef kitle sekmeleri, kayıtsız canlı vitrin, kayıt ön seçimi ve ilk adım
  başlatıcısı telefonda (375×812 ve 360×800) yana taşmaz, dokunma alanları 36 px'ten küçük değil; vitrin
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
  for (const phone of PHONES) {
    test(`ana sayfa sekmeleri ve vitrin ${phone.width}px: taşma yok, dokunma alanı yeterli`, async ({ page }) => {
      await page.setViewportSize(phone);
      await page.goto("/?hedef=universite");
      const tabs = page.getByRole("tab");
      await expect(tabs).toHaveCount(8); // kahramanda 4, vitrinde 4
      await expect(page.getByRole("tab", { name: /Üniversite/ }).first()).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("link", { name: /Vize-final kampını ücretsiz başlat/ })).toHaveAttribute("href", "/kayit?hedef=universite");
      expect(await overflow(page)).toBeLessThanOrEqual(1);
      expect(await smallestTouchTarget(page, "#lp-showcase")).toBeGreaterThanOrEqual(36);
    });
  }

  test("vitrin uçtan uca: ders → soru → ipucu → cevap → köprü; ağ isteği yok", async ({ page }) => {
    const apiCalls: string[] = [];
    page.on("request", (request) => {
      if (/\/api\//.test(request.url()) && !/\/api\/(health|consent)/.test(request.url())) apiCalls.push(request.url());
    });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/?hedef=yks-lgs");
    const showcase = page.locator("#lp-showcase");
    // Geliştirme sunucusunda ilk tıklama hidrasyondan önce düşebilir: soru kartı açılana kadar yeniden dene.
    await expect(async () => {
      await showcase.getByRole("button", { name: /Şimdi kendini dene/ }).click();
      await expect(showcase.getByRole("button", { name: /İki şık arasında kaldım/ })).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 20_000 });
    await showcase.getByRole("button", { name: /İki şık arasında kaldım/ }).click();
    await expect(showcase.getByRole("status")).toContainText("uygulandıkları sayılar farklı");
    await showcase.getByRole("button", { name: /%4 azalmıştır/ }).click();
    await showcase.getByRole("button", { name: "Kontrol et" }).click();
    await expect(showcase.getByText(/İpucuyla çeldiriciyi eledin/)).toBeVisible();
    const bridge = showcase.getByRole("link", { name: /YKS \/ LGS kampını ücretsiz başlat/ });
    await expect(bridge).toHaveAttribute("href", "/kayit?hedef=yks-lgs");
    expect(apiCalls).toEqual([]);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  });

  test("sekme değişince kahraman, köprü bağlantısı ve adres değişir", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: /KPSS/ }).first().click();
    await expect(page.getByRole("link", { name: /Sınav kampını ücretsiz başlat/ })).toHaveAttribute("href", "/kayit?hedef=akademik");
    expect(page.url()).toContain("hedef=akademik");
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
