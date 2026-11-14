import { expect, test, type Page } from "@playwright/test";

/*
  Faz 3B (14 Kasım 2026): kapı ve yükseltme penceresi, ana ekran fikstüründe (/ogretmen, veritabanısız). Başarılı
  gönderim gerektiren adımlar ağ katmanında taklit (402 yolu modele ulaşmaz). 1280 ve 390 px.
  - taze ücretsiz: "Ücretsiz ders", "3 mesaj kaldı", Kalan haklar;
  - ilk dersi bitmiş ücretsiz: kilitli konu adımı → "Yeni ders için Plus gerekli";
  - mesajı bitmiş ücretsiz: gönder → "Bugünkü 3 mesajın bitti", yazılan metin yerinde;
  - Plus %90 (Kullanım satırı), Plus %100 (kilitli adım), Sınav Haftası etiketi, Sigma ve Kurucu teklifsiz;
  - klavye: Enter ile açılır, Tab pencerede döner, Esc kapatır, odak tetikleyiciye döner.
*/

const WIDTHS = [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
] as const;

async function open(page: Page, query: string) {
  await page.goto(`/e2e/ana-ekran?${query}`);
  await expect(page.locator(".cp-sor-root")).toBeVisible();
}

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const size of WIDTHS) {
  test.describe(`hak arayüzü ${size.width} px`, () => {
    test.use({ viewport: size });

    test("taze ücretsiz: Ücretsiz ders, mesaj hakkı, Kalan haklar", async ({ page }) => {
      await open(page, "hazirlik=1&hak=taze");
      await expect(page.getByText("Ücretsiz ders", { exact: true })).toBeVisible();
      await expect(page.getByText("3 mesaj kaldı")).toBeAttached();
      const rights = page.getByRole("region", { name: "Kalan haklar" });
      if (size.width >= 768) {
        await expect(rights).toBeVisible();
        await expect(rights).toContainText("3 / 3 sohbet mesajı");
        await expect(rights).toContainText("1 / 1 fotoğraftan çözüm");
      } else {
        // Telefonda ana ekran kaydırmasız; hak bilgisi çubuğun üstünde ("3 mesaj kaldı"), kart gizli.
        await expect(rights).toBeHidden();
      }
      await noOverflow(page);
    });

    test("ilk dersi bitmiş ücretsiz: kilitli adım pencereyi açar, Esc kapatır, odak geri döner", async ({ page }) => {
      await open(page, "hazirlik=1&hak=kullanildi");
      const next = page.locator(".cx-cockpit-next");
      await expect(next).toHaveAttribute("aria-haspopup", "dialog");
      await expect(next).toContainText("PLUS");
      const box = await next.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(size.width < 768 ? 44 : 40);
      await next.click();
      const dialog = page.getByRole("dialog", { name: "Yeni ders için Plus gerekli" });
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText("Ücretsiz hakkın olan ilk ders kullanıldı.");
      await expect(dialog).toContainText("Sınavına 5 gün var");
      const brand = dialog.locator(".cx-brand");
      await expect(brand).toHaveCount(1);
      await expect(brand).toHaveAttribute("href", "/pay?plan=plus&from=lesson.create");
      await noOverflow(page);
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
      await expect(next).toBeFocused();
      expect(page.url()).not.toContain("tiklandi=1");
    });

    test("klavye: Enter açar, Tab pencerede döner", async ({ page }) => {
      await open(page, "hazirlik=1&hak=kullanildi");
      const next = page.locator(".cx-cockpit-next");
      await next.focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(page.getByRole("button", { name: "Kapat" })).toBeFocused();
      for (let i = 0; i < 6; i += 1) await page.keyboard.press("Tab");
      const inside = await page.evaluate(() => Boolean(document.activeElement?.closest("[role=dialog]")));
      expect(inside).toBe(true);
    });

    test("mesajı bitmiş ücretsiz: gönder → pencere, yazılan metin silinmez", async ({ page }) => {
      await page.route("**/api/ai/chat", (route) =>
        route.fulfill({
          status: 402,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Bugünkü 3 ücretsiz mesajın bitti.",
            code: "free_chat_limit",
            gate: { state: "locked", reason: "daily_messages_used", period: "day", limit: 3, remaining: 0, resetAt: new Date(Date.now() + 3_600_000).toISOString(), requiredPlan: "plus" },
          }),
        }),
      );
      await open(page, "durum=sohbet&hak=bitti");
      const field = page.getByPlaceholder("Sor, konuş veya dosya gönder");
      await field.fill("Türevin geometrik anlamı nedir?");
      await page.getByRole("button", { name: "Gönder" }).click();
      const dialog = page.getByRole("dialog", { name: "Bugünkü 3 mesajın bitti" });
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText("3 / 3 kullanıldı");
      await expect(dialog).toContainText(/Yenilenme \d+ (sa \d+ )?dk/);
      await dialog.getByRole("button", { name: "Yarın devam ederim" }).click();
      await expect(dialog).toBeHidden();
      await expect(field).toHaveValue("Türevin geometrik anlamı nedir?");
    });

    test("Plus %90: Kullanım satırından %90 penceresi", async ({ page }) => {
      // Telefonda profil alt sekmede ayrı sayfa (/profil); yan panel ve kapsül masaüstünde.
      test.skip(size.width < 768, "yan panel masaüstünde");
      await open(page, "plan=plus&kota=90&hazirlik=1");
      await page.getByRole("button", { name: /^Profil/ }).click();
      const usage = page.getByRole("button", { name: /Bu ay %90/ });
      await expect(usage).toBeVisible();
      await expect(usage).toContainText("12 Aralık'ta sıfırlanır · Planın aktif");
      await usage.click();
      const dialog = page.getByRole("dialog", { name: "Aylık limitine yaklaşıyorsun" });
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText("%90");
      await expect(dialog.locator(".cx-brand")).toHaveAttribute("href", /plan=sigma/);
    });

    test("Plus %100: kilitli adım → Bu ayki hakkın doldu", async ({ page }) => {
      await open(page, "plan=plus&kota=100&hazirlik=1");
      await page.locator(".cx-cockpit-next").click();
      await expect(page.getByRole("dialog", { name: "Bu ayki hakkın doldu" })).toBeVisible();
    });

    test("Sınav Haftası, Sigma ve Kurucu: işaret ve teklif yok", async ({ page }) => {
      for (const plan of ["hafta", "sigma", "kurucu"]) {
        await open(page, `plan=${plan}&hazirlik=1`);
        await expect(page.locator(".cx-gate-lock")).toHaveCount(0);
        await expect(page.getByText("Ücretsiz ders", { exact: true })).toHaveCount(0);
        await expect(page.getByRole("region", { name: "Kalan haklar" })).toHaveCount(0);
      }
      if (size.width >= 768) {
        await open(page, "plan=hafta&hazirlik=1");
        await expect(page.locator(".cx-plan-label").first()).toContainText(/Plus · \d+ gün/);
      }
    });
  });
}
